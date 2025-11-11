#!/usr/bin/env python3
# -*- coding: utf-8 -*-

from pathlib import Path
import shutil
import random
import string
import sys

# === KONFIGURACE ==============================================================
# 1) Nastav kořenovou složku, která obsahuje „hlavní složky“.
#    Příklad: ROOT = Path(r"D:\projekty\firmware")
ROOT = Path("../try 2/")  # None nebo Path("/cesta/k/koreni")

# 2) Chceš si složku vybrat kliknutím? (funguje ve většině IDE na desktopu)
USE_GUI_FOLDER_PICKER = True

# 3) „Nanečisto“ režim: True = jen vypisuje, nic nemění na disku
DRY_RUN = False
# ==============================================================================

ESP_SUBFOLDER = "esp32.esp32.esp32s3"
RAND_SUFFIX_LEN = 6  # dle požadavku "XXXXXX" v příkladu


def rand_suffix(n=RAND_SUFFIX_LEN):
    alphabet = string.ascii_lowercase + string.digits
    return "".join(random.choices(alphabet, k=n))


def dir_has_any_files(p: Path) -> bool:
    """Vrátí True, pokud se v adresáři (rekurzivně) nachází nějaký soubor."""
    for item in p.rglob("*"):
        if item.is_file():
            return True
    return False


def ensure_subfolder_and_pack(build_dir: Path, esp_dir: Path, dry_run: bool):
    """Vytvoří esp_dir (pokud neexistuje) a přesune do něj veškerý obsah build_dir kromě samotného esp_dir."""
    if not esp_dir.exists():
        print(f"  - Vytvářím {esp_dir}")
        if not dry_run:
            esp_dir.mkdir(parents=True, exist_ok=True)

    # Přesunout veškerý obsah build_dir -> esp_dir, kromě samotného esp_dir
    for item in list(build_dir.iterdir()):
        if item.name == ESP_SUBFOLDER:
            continue
        target = esp_dir / item.name
        print(f"  - Přesouvám '{item}' -> '{target}'")
        if not dry_run:
            if target.exists():
                if target.is_dir():
                    shutil.rmtree(target)
                else:
                    target.unlink()
            shutil.move(str(item), str(target))


def rename_move_up(build_dir: Path, main_dir: Path, dry_run: bool) -> Path:
    """Přejmenuje build* složku na <původní>_<RANDOM> a přesune ji o úroveň výš. Vrací cílovou cestu."""
    parent = main_dir.parent
    base = build_dir.name
    # najdi unikátní cílový název
    while True:
        candidate = parent / f"{base}_{rand_suffix()}"
        if not candidate.exists():
            break

    print(f"  - Přejmenovávám a přesouvám '{build_dir.name}' -> '{candidate.name}' (o úroveň výš)")
    if not dry_run:
        shutil.move(str(build_dir), str(candidate))
    return candidate


def safe_delete_dir_if_empty(d: Path, dry_run: bool):
    """Smaže složku, pokud neobsahuje žádné soubory (rekurzivně)."""
    if not dir_has_any_files(d):
        print(f"  - Složka '{d}' je prázdná (nebo obsahuje jen prázdné podsložky) → mažu ji")
        if not dry_run:
            shutil.rmtree(d, ignore_errors=True)


def process_main_dir(main_dir: Path, dry_run: bool):
    # najdi všechny složky začínající na "build"
    build_dirs = [p for p in main_dir.iterdir() if p.is_dir() and p.name.startswith("build")]
    if not build_dirs:
        return

    print(f"\nZpracovávám hlavní složku: {main_dir}")

    # Zpracuj každou build* složku; pracujeme se snapshotem seznamu (před přesuny)
    for build_dir in list(build_dirs):
        if not build_dir.exists():
            continue  # mohl být přesunut v průběhu

        esp_dir = build_dir / ESP_SUBFOLDER

        # 1) zajistit esp_dir a přesunout do něj obsah build*/ (mimo samotný esp_dir)
        ensure_subfolder_and_pack(build_dir, esp_dir, dry_run=dry_run)

        # 2) pokud v esp_dir existují soubory, přejmenuj a posuň build* o úroveň výš
        if dir_has_any_files(esp_dir):
            rename_move_up(build_dir, main_dir, dry_run=dry_run)
        else:
            # esp_dir je prázdný → nic nepřesouváme; build_dir (prázdný) zůstává v main_dir
            print(f"  - '{esp_dir}' je prázdný → build-složka zůstává (bude odstraněna, pokud vyjde main_dir jako prázdný)")

    # 3) po zpracování všech build* se pokusíme smazat původní hlavní složku, pokud je fakt prázdná
    safe_delete_dir_if_empty(main_dir, dry_run=dry_run)


def process_root(root: Path, dry_run: bool = False):
    if not root.is_dir():
        raise NotADirectoryError(f"'{root}' není adresář.")

    print(f"Kořen: {root}")
    print(f"Režim: {'DRY-RUN' if dry_run else 'AKČNÍ'}")

    for child in sorted(root.iterdir()):
        if child.is_dir():
            try:
                process_main_dir(child, dry_run=dry_run)
            except Exception as e:
                print(f"  ! Chyba při zpracování '{child}': {e}", file=sys.stderr)

    print("\nHotovo.")


if __name__ == "__main__":
    root = ROOT

    # Volitelný výběr složky přes GUI (pokud ROOT není nastaven ručně)
    if root is None and USE_GUI_FOLDER_PICKER:
        try:
            import tkinter as tk
            from tkinter import filedialog

            tk.Tk().withdraw()
            chosen = filedialog.askdirectory(title="Vyber kořenovou složku")
            if chosen:
                root = Path(chosen)
        except Exception as e:
            print(f"GUI výběr složky se nepodařil: {e}\n"
                  f"→ Nastav ROOT ručně, např. ROOT = Path(r'D:\\projekty\\firmware')")

    if root is None:
        raise SystemExit("Není nastaven ROOT. Uprav proměnnou nahoře nebo zapni GUI volbu složky.")

    process_root(root, dry_run=DRY_RUN)
