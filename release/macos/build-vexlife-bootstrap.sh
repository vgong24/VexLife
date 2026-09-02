#!/bin/bash
set -euo pipefail

EXPECTED_SHA256='a09867eb2e827cb3f4ca84b11eae87420ba58738e4dec68de8b11cce3cd84eca'
EXPECTED_BYTES='8765440'
EXPECTED_TAR_NAME='vexlife-source-3d2ef4c81a5b6b5a7ba717178fb3479511299e08.tar'

usage() { printf 'Usage: %s --source-tar <path> [--out <relative-subdirectory>]\n' "$0"; }
SOURCE_TAR=''
OUT='macos-host-build'
while [ "$#" -gt 0 ]; do
  case "$1" in
    --source-tar) SOURCE_TAR="${2:-}"; shift 2 ;;
    --out) OUT="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) printf 'Unknown argument: %s\n' "$1" >&2; usage; exit 2 ;;
  esac
done
[ -n "$SOURCE_TAR" ] || { usage; exit 2; }

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd -P)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd -P)"
SOURCE_TAR="$(cd "$(dirname "$SOURCE_TAR")" && pwd -P)/$(basename "$SOURCE_TAR")"
[ -f "$SOURCE_TAR" ] || { printf 'Source TAR is missing.\n' >&2; exit 2; }
OBSERVED_BYTES="$(/usr/bin/stat -f '%z' "$SOURCE_TAR")"
OBSERVED_SHA256="$(/usr/bin/shasum -a 256 "$SOURCE_TAR" | /usr/bin/awk '{print $1}')"
[ "$OBSERVED_BYTES" = "$EXPECTED_BYTES" ] && [ "$OBSERVED_SHA256" = "$EXPECTED_SHA256" ] || {
  printf 'Source TAR does not match the frozen R1/R2 candidate.\n' >&2; exit 2;
}

/usr/bin/env node "$REPO_ROOT/scripts/release-bootstrap-package.mjs" --platform macos --source-tar "$SOURCE_TAR" --out "$OUT"
OUT_ROOT="$REPO_ROOT/generated/release-bootstrap-packages/$OUT"
PACKAGE_PLAN_SHA256="$(/usr/bin/shasum -a 256 "$OUT_ROOT/package-plan.json" | /usr/bin/awk '{print $1}')"
PACKAGING_SOURCE_COMMIT="$(/usr/bin/env node -e 'const p=require(process.argv[1]); process.stdout.write(p.packagingSource.packagingSourceCommit)' "$OUT_ROOT/package-plan.json")"
PACKAGING_SOURCE_TREE="$(/usr/bin/env node -e 'const p=require(process.argv[1]); process.stdout.write(p.packagingSource.packagingSourceTree)' "$OUT_ROOT/package-plan.json")"
PACKAGING_SOURCE_SET_SHA256="$(/usr/bin/env node -e 'const p=require(process.argv[1]); process.stdout.write(p.packagingSource.packagingSourceSetSha256)' "$OUT_ROOT/package-plan.json")"
APP="$OUT_ROOT/VexLife Setup.app"
DMG="$OUT_ROOT/VexLife-Setup-macOS-unsigned.dmg"
/bin/rm -rf "$APP" "$DMG"
/bin/mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
/bin/cp "$REPO_ROOT/release/macos/VexLifeSetupLauncher.sh" "$APP/Contents/MacOS/VexLifeSetupLauncher"
/bin/chmod 0755 "$APP/Contents/MacOS/VexLifeSetupLauncher"
/bin/cp "$SOURCE_TAR" "$APP/Contents/Resources/$EXPECTED_TAR_NAME"
for receipt in package-plan.json release-notice-receipt.json source-archive-receipt.json; do
  /bin/cp "$OUT_ROOT/$receipt" "$APP/Contents/Resources/$receipt"
done
/bin/cat > "$APP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleName</key><string>VexLife Setup</string>
  <key>CFBundleDisplayName</key><string>VexLife Setup</string>
  <key>CFBundleIdentifier</key><string>com.vextreme.vexlife.setup</string>
  <key>CFBundleVersion</key><string>1</string>
  <key>CFBundleShortVersionString</key><string>0.4.0-rc1</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleExecutable</key><string>VexLifeSetupLauncher</string>
  <key>LSMinimumSystemVersion</key><string>13.0</string>
</dict></plist>
PLIST
/usr/bin/plutil -lint "$APP/Contents/Info.plist" >/dev/null
/usr/bin/hdiutil create -volname 'VexLife Setup' -srcfolder "$APP" -ov -format UDZO "$DMG" >/dev/null
ARTIFACT_SHA256="$(/usr/bin/shasum -a 256 "$DMG" | /usr/bin/awk '{print $1}')"
ARTIFACT_BYTES="$(/usr/bin/stat -f '%z' "$DMG")"
/bin/cat > "$OUT_ROOT/build-receipt.json" <<JSON
{
  "schemaVersion": "vexlife.release-bootstrap-build-receipt/v1",
  "platform": "macos",
  "artifactClass": "MACOS_UNSIGNED_DIRECT_BOOTSTRAP_CANDIDATE",
  "containerClass": "MACOS_UNSIGNED_APP_IN_UDZO_DMG_CANDIDATE",
  "artifactFilename": "$(basename "$DMG")",
  "artifactSha256": "$ARTIFACT_SHA256",
  "artifactBytes": $ARTIFACT_BYTES,
  "sourceTarSha256": "$OBSERVED_SHA256",
  "sourceTarBytes": $OBSERVED_BYTES,
  "packagingSourceCommit": "$PACKAGING_SOURCE_COMMIT",
  "packagingSourceTree": "$PACKAGING_SOURCE_TREE",
  "packagingSourceSetSha256": "$PACKAGING_SOURCE_SET_SHA256",
  "packagePlanSha256": "$PACKAGE_PLAN_SHA256",
  "containerDeterminismState": "HOST_REPEAT_BUILD_QUALIFICATION_REQUIRED",
  "signing": false,
  "notarization": false,
  "publication": false,
  "githubReleaseCreation": false,
  "officialVerifiedBuildPromotion": false
}
JSON
printf '%s  %s\n' "$ARTIFACT_SHA256" "$(basename "$DMG")" > "$OUT_ROOT/SHA256SUMS"
printf 'VEXLIFE_UNSIGNED_MACOS_BOOTSTRAP_READY=%s\n' "$DMG"

# [VXG RealForever]
