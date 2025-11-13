#!/usr/bin/env python3
# -*- coding: utf-8 -*-

from __future__ import annotations
from pathlib import Path
from datetime import datetime
from collections import defaultdict
from typing import Dict, List, Tuple, Optional
import hashlib
import shutil


# === SETTINGS ======================================================
# Root folder containing "main folders"
ROOT_DIR = Path(r"./../").resolve()

# Pattern of the firmware file
INO_PATTERN = "*.ino.bin"

# Safety: if True, only prints what WOULD be deleted.
# Set to False to actually delete duplicate folders.
DRY_RUN = False
# ==================================================================


def file_sha256(path: Path) -> str:
    """
    Compute SHA-256 hash of a file (used to check if files are identical).
    """
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


def find_ino_in_main_folder(main_folder: Path) -> Optional[Path]:
    """
    Search recursively inside a single main folder for the first
    *.ino.bin file.

    Returns:
        Path to the file, or None if not found.
    """
    for p in main_folder.rglob(INO_PATTERN):
        if p.is_file():
            return p
    return None


def collect_ino_files(root: Path) -> Dict[str, Path]:
    """
    Go through all *direct subdirectories* of root (main folders),
    and for each one find its *.ino.bin file.

    Returns:
        dict: main_folder_name -> Path_to_file
    """
    results: Dict[str, Path] = {}

    if not root.is_dir():
        print(f"Root directory does not exist or is not a directory: {root}")
        return results

    # Only first-level directories are considered "main folders"
    for entry in root.iterdir():
        if not entry.is_dir():
            continue
        if entry.name.startswith('.'):
            continue  # skip hidden folders
        if entry.name == "others":
            continue  # skip the script folder itself (if present)

        main_folder = entry
        ino_file = find_ino_in_main_folder(main_folder)

        if ino_file is None:
            print(f"[INFO] No {INO_PATTERN} file found in main folder: {main_folder.name}")
            continue

        results[main_folder.name] = ino_file

    return results


def group_by_hash(files_by_folder: Dict[str, Path]) -> Dict[str, List[Tuple[str, Path]]]:
    """
    Group main folders by SHA-256 hash of their *.ino.bin file.

    Input:
        files_by_folder: main_folder_name -> Path_to_file

    Output:
        dict: sha256_hash -> list of (main_folder_name, Path_to_file)
    """
    groups: Dict[str, List[Tuple[str, Path]]] = defaultdict(list)
    for folder_name, file_path in files_by_folder.items():
        h = file_sha256(file_path)
        groups[h].append((folder_name, file_path))
    return groups


def build_full_list(files_by_folder: Dict[str, Path], root: Path) -> str:
    """
    Build a list of all found *.ino.bin files with their hash and creation time.
    """
    if not files_by_folder:
        return f"No {INO_PATTERN} files were found in any main folder."

    lines: List[str] = []
    lines.append(f"=== All found {INO_PATTERN} files ===")
    for folder_name, file_path in sorted(files_by_folder.items()):
        try:
            rel_path = file_path.relative_to(root)
        except ValueError:
            rel_path = file_path
        ctime = file_path.stat().st_ctime
        dt = datetime.fromtimestamp(ctime)
        time_str = dt.strftime("%Y-%m-%d %H:%M:%S")
        h = file_sha256(file_path)

        lines.append(f"Main folder: {folder_name}")
        lines.append(f"  File:          {rel_path.as_posix()}")
        lines.append(f"  Creation time: {time_str}")
        lines.append(f"  SHA-256:       {h}")
        lines.append("")

    return "\n".join(lines)


def build_identical_report(groups: Dict[str, List[Tuple[str, Path]]], root: Path) -> str:
    """
    Build a text report showing groups of main folders whose *.ino.bin
    files are bitwise identical (same SHA-256 hash).

    For each folder, print:
      - main folder name
      - relative file path
      - creation time of the file
    """
    lines: List[str] = []
    anything_found = False

    lines.append(f"=== Folders with identical {INO_PATTERN} files (same SHA-256) ===")

    for h, items in sorted(groups.items()):
        if len(items) < 2:
            continue  # only hashes shared by multiple main folders

        anything_found = True
        lines.append(f"\nSHA-256: {h}")
        lines.append("-" * 60)

        # sort by folder name for deterministic output
        for folder_name, file_path in sorted(items, key=lambda t: t[0]):
            try:
                rel_path = file_path.relative_to(root)
            except ValueError:
                rel_path = file_path

            ctime = file_path.stat().st_ctime
            dt = datetime.fromtimestamp(ctime)
            time_str = dt.strftime("%Y-%m-%d %H:%M:%S")

            lines.append(f"Main folder:     {folder_name}")
            lines.append(f"  File:          {rel_path.as_posix()}")
            lines.append(f"  Creation time: {time_str}")
            lines.append("")
        lines.append("-" * 60)

    if not anything_found:
        lines.append(
            f"\nNo main folders with identical {INO_PATTERN} files were found "
            "(no shared SHA-256 hash)."
        )

    return "\n".join(lines)


def plan_keep_oldest(groups: Dict[str, List[Tuple[str, Path]]]) -> Tuple[List[Tuple[str, Path]], List[Tuple[str, Path]]]:
    """
    For each hash group with 2+ items:
      - keep the folder whose *.ino.bin has the oldest creation time,
      - mark all other folders from that group for deletion.

    Returns:
        (keep_list, delete_list)
        where each list contains (main_folder_name, file_path)
    """
    keep: List[Tuple[str, Path]] = []
    delete: List[Tuple[str, Path]] = []

    for h, items in groups.items():
        if len(items) < 2:
            continue

        # enrich items with ctime
        with_ctime = []
        for folder_name, file_path in items:
            ctime = file_path.stat().st_ctime
            with_ctime.append((folder_name, file_path, ctime))

        # find oldest (smallest ctime); if tie, pick by folder_name
        with_ctime.sort(key=lambda t: (t[2], t[0]))
        oldest_folder_name, oldest_path, oldest_ctime = with_ctime[0]

        keep.append((oldest_folder_name, oldest_path))

        # others go to delete list
        for folder_name, file_path, ctime in with_ctime[1:]:
            delete.append((folder_name, file_path))

    return keep, delete


def delete_main_folders(root: Path, to_delete: List[Tuple[str, Path]]) -> None:
    """
    Delete whole main folders (directories) for all entries in to_delete.
    Each entry is (main_folder_name, file_path_inside_that_folder).
    """
    # use set to avoid deleting the same folder multiple times
    folder_names = sorted({folder_name for folder_name, _ in to_delete})
    for folder_name in folder_names:
        folder_path = root / folder_name
        if folder_path.exists() and folder_path.is_dir():
            print(f"[DELETE] Removing folder: {folder_path}")
            try:
                shutil.rmtree(folder_path)
            except Exception as e:
                print(f"[ERROR] Failed to delete folder {folder_path}: {e}")
        else:
            print(f"[WARN] Folder not found or not a directory: {folder_path}")


def main() -> None:
    print(f"Root directory: {ROOT_DIR}")
    print(f"DRY_RUN = {DRY_RUN} (set to False to actually delete folders)\n")

    files_by_folder = collect_ino_files(ROOT_DIR)
    if not files_by_folder:
        print(f"No {INO_PATTERN} files were found in any main folder.")
        return

    # 1) Print all found files + their hash and time
    print(build_full_list(files_by_folder, ROOT_DIR))

    # 2) Analyze identical files (same hash)
    groups = group_by_hash(files_by_folder)
    print()
    print(build_identical_report(groups, ROOT_DIR))

    # 3) Decide which folders to keep and which to delete
    keep, to_delete = plan_keep_oldest(groups)

    if not to_delete:
        print("\n=== No duplicate groups where deletion is needed ===")
        return

    print("\n=== De-duplication plan (per hash group) ===")
    print("Keeping the oldest folder in each identical-file group, deleting the others.\n")

    print("Will KEEP these folders:")
    for folder_name, file_path in sorted(keep, key=lambda t: t[0]):
        ctime = file_path.stat().st_ctime
        dt = datetime.fromtimestamp(ctime)
        time_str = dt.strftime("%Y-%m-%d %H:%M:%S")
        print(f"  {folder_name}  (file: {file_path.name}, creation: {time_str})")

    print("\nWill DELETE these folders:")
    for folder_name, file_path in sorted(to_delete, key=lambda t: t[0]):
        ctime = file_path.stat().st_ctime
        dt = datetime.fromtimestamp(ctime)
        time_str = dt.strftime("%Y-%m-%d %H:%M:%S")
        print(f"  {folder_name}  (file: {file_path.name}, creation: {time_str})")

    if DRY_RUN:
        print("\n[DRY RUN] No folders were actually deleted. "
              "Set DRY_RUN = False if you are sure you want to remove them.")
    else:
        print("\n[EXECUTION] Deleting duplicate folders...")
        delete_main_folders(ROOT_DIR, to_delete)
        print("Done.")


if __name__ == "__main__":
    main()
