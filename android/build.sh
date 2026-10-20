#!/usr/bin/env bash
# Compila la APK sin Gradle ni Android Studio.
# Requisitos (Ubuntu/Debian): sudo apt install openjdk-17-jdk aapt apksigner zipalign android-sdk-platform-23 zip
set -euo pipefail
cd "$(dirname "$0")"
ROOT=$(cd .. && pwd)
ANDROID_JAR=${ANDROID_JAR:-/usr/lib/android-sdk/platforms/android-23/android.jar}
R8=${R8:-/tmp/r8lib.jar}
[ -f "$R8" ] || curl -sSL -o "$R8" https://storage.googleapis.com/r8-releases/raw/8.5.35/r8lib.jar
B=build; rm -rf $B; mkdir -p $B/classes $B/dex $B/apk/assets/www ../dist

# 1) recursos + manifiesto
aapt2 compile --dir res -o $B/res.zip
aapt2 link -o $B/base.apk -I "$ANDROID_JAR" --manifest AndroidManifest.xml \
  --min-sdk-version 21 --target-sdk-version 30 --version-code 1 --version-name 1.0 $B/res.zip

# 2) código Java -> dex
javac --release 8 -nowarn -cp "$ANDROID_JAR" -d $B/classes $(find src -name '*.java')
java -cp "$R8" com.android.tools.r8.D8 --lib "$ANDROID_JAR" --min-api 21 --output $B/dex $(find $B/classes -name '*.class')

# 3) la web empaquetada dentro del APK
cp "$ROOT/index.html" "$ROOT/manifest.webmanifest" $B/apk/assets/www/
cp -r "$ROOT/lib" "$ROOT/icons" $B/apk/assets/www/
cp $B/dex/classes.dex $B/apk/
(cd $B/apk && zip -qr ../base.apk classes.dex assets)

# 4) alinear y firmar (v1+v2+v3)
[ -f debug.keystore ] || keytool -genkeypair -keystore debug.keystore -storepass android -keypass android \
  -alias duelos -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Duelos Debug,O=Duelos,C=ES" >/dev/null 2>&1
zipalign -f -p 4 $B/base.apk $B/aligned.apk
apksigner sign --ks debug.keystore --ks-pass pass:android --key-pass pass:android --ks-key-alias duelos \
  --out ../dist/PokemonDuelos.apk $B/aligned.apk
apksigner verify -v ../dist/PokemonDuelos.apk | head -6
ls -la ../dist/PokemonDuelos.apk
