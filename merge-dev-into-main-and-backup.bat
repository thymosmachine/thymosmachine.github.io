@echo off
setlocal enabledelayedexpansion

:: --- Bezpecnostni kontroly ---
git rev-parse --is-inside-work-tree >NUL 2>&1 || (echo [ERR] Tohle neni git repo. & exit /b 1)

echo [INFO] Kontroluji, ze neni rozpracovany commit/stage...
git diff --quiet || (echo [ERR] Mas neulozene zmeny v working tree. Commitni/stashni je. & exit /b 1)
git diff --cached --quiet || (echo [ERR] Mas zmeny ve stage. Commitni/stashni je. & exit /b 1)

echo [INFO] Fetch z origin...
git fetch --all --prune || (echo [ERR] Fetch selhal. & exit /b 1)

:: Overime, ze existuji vetve na origin
git rev-parse --verify origin/main  >NUL 2>&1 || (echo [ERR] Vetev origin/main neexistuje. & exit /b 1)
git rev-parse --verify origin/development >NUL 2>&1 || (echo [ERR] Vetev origin/development neexistuje. & exit /b 1)

:: --- Aktualizace main ---
echo [INFO] Checkout main a fast-forward pull...
git checkout main || (echo [ERR] Nejde checkoutnout main. & exit /b 1)
git pull --ff-only origin main || (echo [ERR] Nepodarilo se fast-forwardnout main. & exit /b 1)

for /f %%i in ('git rev-parse HEAD') do set PRE_MERGE_SHA=%%i
echo [INFO] HEAD pred merge: !PRE_MERGE_SHA!

:: --- Vytvoreni/aktualizace backup-main ---
echo [INFO] Pripravuji vetev backup-main na puvodni stav main (pred merge)...
git checkout -B backup-main !PRE_MERGE_SHA! || (echo [ERR] Nelze vytvorit/aktualizovat backup-main. & exit /b 1)

:: Pridame znackovaci (prazdny) commit, aby bylo v historii jasne kdy k zaloze doslo
git commit --allow-empty -m "Backup of main before merging 'development' into 'main'. Base: !PRE_MERGE_SHA!" || (echo [ERR] Nelze vytvorit prazdny backup commit. & exit /b 1)

:: Push backupu (vytvori / aktualizuje referenci na remote)
echo [INFO] Pushuji backup-main...
git push --set-upstream origin backup-main --force-with-lease || (echo [ERR] Push backup-main selhal. & exit /b 1)

:: --- Merge development -> main ---
echo [INFO] Zpet na main a merge 'development' do 'main'...
git checkout main || (echo [ERR] Nelze prepnout zpet na main. & exit /b 1)

:: Pouzijeme --no-ff, aby vznikl merge commit i pri FF moznosti
git merge --no-ff origin/development -m "Merge branch 'development' into 'main'" || (
  echo.
  echo [ERR] Merge vyzaduje rucni reseni konfliktu. Vyres je a pak dokonci commit/push rucne.
  exit /b 1
)

echo [INFO] Pushuji main...
git push origin main || (echo [ERR] Push main selhal. & exit /b 1)

echo [OK] Hotovo. 'development' sloucen do 'main' a zaloha stavu pred merge je v 'backup-main' (s oznacenym commitem).
exit /b 0
