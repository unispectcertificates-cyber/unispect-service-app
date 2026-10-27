$ErrorActionPreference = "Stop"
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:PATH = "C:\Program Files\Android\Android Studio\jbr\bin;" + $env:PATH
Write-Host "Java Version:"
& java -version
Write-Host "Running Firebase Emulator Suite..."
& npx firebase-tools emulators:exec --config firebase.test.json --project demo-unispect-test "node test-auth-isolation.mjs"
