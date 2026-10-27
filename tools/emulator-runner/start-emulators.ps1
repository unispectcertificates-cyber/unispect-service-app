$ErrorActionPreference = "Stop"
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:PATH = "C:\Program Files\Android\Android Studio\jbr\bin;" + $env:PATH
Write-Host "Iniciando Firebase Emulator Suite (Auth: 9099, Firestore: 8080, Storage: 9199)..."
& npx firebase-tools emulators:start --config firebase.test.json --project demo-unispect-test
