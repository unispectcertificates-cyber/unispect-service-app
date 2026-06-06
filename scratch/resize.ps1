Add-Type -AssemblyName System.Drawing
$sourcePath = "C:\Users\unisp\.gemini\antigravity-ide\brain\20bd9ba4-4633-48f9-bbeb-c4b8e76693b7\media__1780716612151.png"

$img = [System.Drawing.Image]::FromFile($sourcePath)

# Generate 512x512
$bmp512 = New-Object System.Drawing.Bitmap 512, 512
$g512 = [System.Drawing.Graphics]::FromImage($bmp512)
$g512.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g512.DrawImage($img, 0, 0, 512, 512)
$bmp512.Save("c:\Users\unisp\Documents\Documento IA Google Antigravity\public\pwa-512x512.png", [System.Drawing.Imaging.ImageFormat]::Png)

# Generate 192x192
$bmp192 = New-Object System.Drawing.Bitmap 192, 192
$g192 = [System.Drawing.Graphics]::FromImage($bmp192)
$g192.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g192.DrawImage($img, 0, 0, 192, 192)
$bmp192.Save("c:\Users\unisp\Documents\Documento IA Google Antigravity\public\pwa-192x192.png", [System.Drawing.Imaging.ImageFormat]::Png)

# Cleanup
$g512.Dispose()
$bmp512.Dispose()
$g192.Dispose()
$bmp192.Dispose()
$img.Dispose()

Write-Output "Successfully generated PWA PNG icons from the source image!"
