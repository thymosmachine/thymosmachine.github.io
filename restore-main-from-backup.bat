@echo off
setlocal

git rev-parse --is-inside-work-tree >NUL 2>&1 || (echo [ERR] Tohle neni git repo. & exit /b 1)

echo [INFO] Kontroluji cistotu working tree...
git diff --quiet || (echo [ERR] Mas neulozene zmeny v working tree. Commitni/stashni je. & exit /b 1)
git diff --cached --quiet || (echo [ERR] Mas zmeny ve stage. Commitni/stashni je. & exit /b 1)

echo [INFO] Fetch z origin...
git fetch --all --prune || (echo [ERR] Fetch selhal. & exit /b 1)

git rev-parse --verify origin/backup-main >NUL 2>&1 || (echo [ERR] Vetev origin/backup-main neexistuje. Neni z ceho obnovit. & exit /b 1)

echo [INFO] Prepinam na main...
git checkout main || (echo [ERR] Nelze checkoutnout main. & exit /b 1)

for /f %%i in ('git rev-parse HEAD') do set CUR_SHA=%%i
echo [INFO] Aktualni HEAD main: %CUR_SHA%

:: Volitelne: bezpecnostni tag na soucasny stav (jen lokalne)
git tag -f restore-safety-%RANDOM% %CUR_SHA% >NUL 2>&1

echo [WARN] Reset main -> origin/backup-main (HARD)...
git reset --hard origin/backup-main || (echo [ERR] Reset selhal. & exit /b 1)

echo [INFO] Push zmen zpet na origin/main (force-with-lease)...
git push --force-with-lease origin main || (echo [ERR] Force push selhal. & exit /b 1)

echo [OK] Hotovo. 'main' vracen do stavu z 'backup-main'.
exit /b 0
