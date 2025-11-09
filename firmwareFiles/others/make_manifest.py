#!/usr/bin/env python3
# -*- coding: utf-8 -*-

from __future__ import annotations
import json
from pathlib import Path
from typing import Dict, List, Optional

# === Nastavení hlavičky manifestu (můžeš klidně upravit v IDE) ===
MANIFEST_NAME = "MOIRA UPDATER – THYMOS"
MANIFEST_VERSION = "1.0.0"
HOMEPAGE = "https://www.thymos.cz"

MAIN_ROOT = Path("../") # None x Path(__file__).parent.resolve() x Path("/path/to/firmwareFiles/others")

# === Rozpoznání typů a offsety ===
TYPE_KEYWORDS = {
    "merged": "merged",
    "bootloader": "bootloader",
    "partitions": "partitions",
    "application": "application",  # fallback
}
OFFSETS = {
    "merged": 0,
    "bootloader": 0,
    "partitions": 32768,
    "application": 65536,
}

def detect_part_type(filename: str) -> str:
    name = filename.lower()
    if "merged" in name:
        return "merged"
    if "bootloader" in name:
        return "bootloader"
    if "partitions" in name:
        return "partitions"
    return "application"

def path_to_posix(root: Path, p: Path) -> str:
    rel = p.relative_to(root)
    return "./" + rel.as_posix()

def bump_patch(v: str) -> str:
    try:
        a, b, c = (int(x) for x in v.split("."))
    except Exception:
        return "0.0.1"
    return f"{a}.{b}.{c+1}"

def collect_bins_by_top_folder(root: Path) -> Dict[str, List[Path]]:
    groups: Dict[str, List[Path]] = {}
    for p in root.rglob("*.bin"):
        if not p.is_file():
            continue
        rel_parts = p.relative_to(root).parts
        top = rel_parts[0] if len(rel_parts) > 1 else "root"
        groups.setdefault(top, []).append(p)
    return groups

def find_file_recursively(base_dir: Path, needle: str) -> Optional[Path]:
    for p in base_dir.rglob("*"):
        if p.is_file() and p.name == needle:
            return p
    return None

def normalize_manifest_part_entry(group_dir: Path, root: Path, entry: dict) -> Optional[dict]:
    etype = entry.get("type")
    if not etype:
        candidate = entry.get("path") or entry.get("file")
        if not candidate:
            return None
        etype = detect_part_type(str(candidate))
    etype = etype.lower()
    if etype not in OFFSETS:
        return None

    raw = entry.get("path") or entry.get("file")
    if not raw:
        return None

    raw_path = Path(raw)
    if raw_path.is_absolute():
        final_path = raw_path
        try:
            # držme relativní cestu vůči rootu v manifestu
            final_path.relative_to(root)
        except Exception:
            pass
    else:
        if len(raw_path.parts) == 1:
            found = find_file_recursively(group_dir, raw_path.name)
            if not found:
                return None
            final_path = found
        else:
            final_path = group_dir / raw_path

    if not final_path.exists():
        fallback = find_file_recursively(group_dir, final_path.name)
        if not fallback:
            return None
        final_path = fallback

    offset = entry.get("offset", OFFSETS[etype])
    return {
        "type": etype,
        "path": path_to_posix(root, final_path),
        "offset": int(offset),
    }

def read_folder_manifest(group_dir: Path, root: Path) -> Optional[dict]:
    mf = group_dir / "manifest.json"
    if not mf.exists():
        return None
    try:
        data = json.loads(mf.read_text(encoding="utf-8"))
    except Exception:
        return None

    name = data.get("name")
    version = data.get("version")

    raw_parts = data.get("parts", [])
    parts: List[dict] = []
    if isinstance(raw_parts, list):
        for entry in raw_parts:
            if not isinstance(entry, dict):
                continue
            norm = normalize_manifest_part_entry(group_dir, root, entry)
            if norm:
                parts.append(norm)

    return {"name": name, "version": version, "parts": parts}

def build_manifest(root: Path) -> Dict:
    groups = collect_bins_by_top_folder(root)
    sorted_group_names = sorted(groups.keys())

    next_version = "0.0.0"
    builds = []

    for group_name in sorted_group_names:
        files = sorted(groups[group_name], key=lambda p: p.as_posix())
        group_dir = root if group_name == "root" else root / group_name

        # Primárně zkusit manifest složky
        folder_manifest = read_folder_manifest(group_dir, root)
        parts_from_folder = folder_manifest["parts"] if folder_manifest else []

        # Autodetekce .bin fallback
        auto_parts_by_type: Dict[str, List[dict]] = {}
        for f in files:
            if f.suffix.lower() != ".bin":
                continue
            ptype = detect_part_type(f.name)
            if ptype not in OFFSETS:
                continue
            auto_parts_by_type.setdefault(ptype, []).append({
                "type": ptype,
                "path": path_to_posix(root, f),
                "offset": OFFSETS[ptype],
            })

        # Sloučení: přednost parts z folder manifestu, chybějící typy doplnit z auto
        selected_types = {p["type"] for p in parts_from_folder}
        merged_parts: List[dict] = []
        merged_parts.extend(parts_from_folder)
        for ptype, plist in auto_parts_by_type.items():
            if ptype in selected_types:
                continue
            merged_parts.extend(plist)

        if not merged_parts:
            continue

        bname = (folder_manifest.get("name") if folder_manifest else None) or group_name
        bversion = (folder_manifest.get("version") if folder_manifest else None) or next_version

        builds.append({
            "name": bname,
            "version": bversion,
            "parts": merged_parts,
        })

        if not (folder_manifest and folder_manifest.get("version")):
            next_version = bump_patch(next_version)

    return {
        "name": MANIFEST_NAME,
        "version": MANIFEST_VERSION,
        "homepage": HOMEPAGE,
        "builds": builds,
    }

# === „IDE mode“: jednoduché GUI pro výběr složky a uložení ===
def run_interactive():
    try:
        import tkinter as tk
        from tkinter import filedialog, messagebox
    except Exception:
        # fallback: bez GUI – vyžádej si cestu přes input() (pořád funguje v IDE)
        root_str = input("Zadej cestu ke kořenové složce: ").strip('"').strip()
        root = Path(root_str).expanduser().resolve()
        if not root.exists() or not root.is_dir():
            print(f"Chyba: '{root}' není platná složka.")
            return
        manifest = build_manifest(root)
        out_path = root / "manifest.json"
        out_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"Hotovo: {out_path}")
        return

    # GUI varianta
    app = tk.Tk()
    app.withdraw()
    app.update()

    folder = filedialog.askdirectory(title="Vyber kořenovou složku s .bin soubory")
    if not folder:
        return

    root = Path(folder).expanduser().resolve()
    if not root.exists() or not root.is_dir():
        messagebox.showerror("Chyba", f"'{root}' není platná složka.")
        return

    manifest = build_manifest(root)
    out_path = root / "manifest.json"
    out_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")

    messagebox.showinfo("Hotovo", f"Vytvořen soubor:\n{out_path}")

if __name__ == "__main__":
    # Spusť přímo v IDE (Run ▶) – otevře dialog pro výběr složky a uloží manifest.json do ní
    if (MAIN_ROOT is not None) and MAIN_ROOT.exists() and MAIN_ROOT.is_dir():
        manifest = build_manifest(MAIN_ROOT)
        out_path = MAIN_ROOT / "manifest.json"
        out_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"Hotovo: {out_path}")
    else:
        run_interactive()
