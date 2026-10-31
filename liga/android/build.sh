#!/usr/bin/env bash
# Empaqueta la liga (dist/) en un APK sin Gradle. Requisitos: openjdk, aapt, apksigner, zipalign, android-sdk-platform-23, zip.
# Antes: npm run build
set -euo pipefail
cd "$(dirname "$0")"
ANDROID_JAR=${ANDROID_JAR:-/usr/lib/android-sdk/platforms/android-23/android.jar}
R8=${R8:-/tmp/r8lib.jar}
[ -f "$R8" ] || curl -sSL -o "$R8" https://storage.googleapis.com/r8-releases/raw/8.5.35/r8lib.jar
[ -f ../dist/index.html ] || { echo "Falta ../dist: ejecuta npm run build"; exit 1; }
B=build; rm -rf $B; mkdir -p $B/classes $B/dex $B/apk/assets/www out
aapt2 compile --dir res -o $B/res.zip
aapt2 link -o $B/base.apk -I "$ANDROID_JAR" --manifest AndroidManifest.xml \
  --min-sdk-version 21 --target-sdk-version 30 --version-code 1 --version-name 1.0 $B/res.zip
javac --release 8 -nowarn -cp "$ANDROID_JAR" -d $B/classes $(find src -name '*.java')
java -cp "$R8" com.android.tools.r8.D8 --lib "$ANDROID_JAR" --min-api 21 --output $B/dex $(find $B/classes -name '*.class')
cp -r ../dist/. $B/apk/assets/www/
cp $B/dex/classes.dex $B/apk/
(cd $B/apk && zip -qr0 ../base.apk classes.dex assets)
zipalign -f -p 4 $B/base.apk $B/aligned.apk
apksigner sign --ks debug.keystore --ks-pass pass:android --key-pass pass:android --ks-key-alias duelos \
  --out out/LigaPokemon.apk $B/aligned.apk
apksigner verify -v out/LigaPokemon.apk | head -4
ls -la out/LigaPokemon.apk
