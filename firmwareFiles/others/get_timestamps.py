import os
from datetime import datetime
from collections import defaultdict


# >>> SET THE PATH TO YOUR ROOT DIRECTORY HERE <<<
# Example: r"C:\projects\firmware" or "/home/user/firmware"
ROOT_DIR = r"C:\path\to\your\root\folder"


def find_bootloader_files(root_dir: str):
    """
    Walk the root directory and locate .ino.bootloader.bin files inside
    each main subfolder. Returns a dict:
        main_folder -> (file_path, creation_time_timestamp)
    """
    results = {}

    # First level: list main subfolders inside root
    try:
        _, main_folders, _ = next(os.walk(root_dir))
    except StopIteration:
        print("Root directory does not exist or is empty.")
        return results

    for folder in main_folders:
        main_folder_path = os.path.join(root_dir, folder)
        found = False

        # Recursively search inside the main folder
        for dirpath, dirnames, filenames in os.walk(main_folder_path):
            for fname in filenames:
                if fname.endswith(".ino.bootloader.bin"):
                    full_path = os.path.join(dirpath, fname)
                    ctime = os.path.getctime(full_path)
                    results[folder] = (full_path, ctime)
                    found = True
                    break
            if found:
                break

    return results


def group_by_creation_time(results):
    """
    Input: dict of main_folder -> (path, ctime)
    Output: dict of ctime -> list of (main_folder, path)
    """
    groups = defaultdict(list)
    for main_folder, (path, ctime) in results.items():
        groups[ctime].append((main_folder, path))
    return groups


def print_groups(groups):
    """
    Print only the groups where 2 or more main folders have the same creation time.
    """
    anything_found = False

    for ctime, items in sorted(groups.items()):
        if len(items) < 2:
            continue

        anything_found = True
        dt = datetime.fromtimestamp(ctime)
        time_str = dt.strftime("%Y-%m-%d %H:%M:%S")

        print(f"\nCreation date/time: {time_str}")
        print("-" * 40)
        for main_folder, file_path in items:
            print(f"Main folder: {main_folder}")
            print(f"  File: {file_path}")
        print("-" * 40)

    if not anything_found:
        print("No main folders with matching .ino.bootloader.bin creation date/time were found.")


def main():
    if not os.path.isdir(ROOT_DIR):
        print(f"ROOT_DIR does not exist or is not a directory: {ROOT_DIR}")
        return

    print(f"Scanning root directory: {ROOT_DIR}")
    results = find_bootloader_files(ROOT_DIR)

    if not results:
        print("No .ino.bootloader.bin files found inside the main folders.")
        return

    groups = group_by_creation_time(results)
    print_groups(groups)


if __name__ == "__main__":
    main()
