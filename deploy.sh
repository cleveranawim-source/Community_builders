#!/usr/bin/env bash
# 공동체 빌더스 배포 스크립트
# gh-pages 히스토리를 갈아엎지 않고(orphan force-push 금지) 기존 위에 얹어
# GitHub Pages 빌드 트리거를 안정적으로 발생시킨다.
#
# 계정 주소(메일·드라이브 계정)는 이 파일에 적지 않는다 (2026-11-19).
# - 저장소·사이트 주소는 git 원격 설정에서 읽는다.
# - gh-pages 커밋 작성자는 이 맥의 전역 git 설정을 쓴다.
# - 드라이브 폴더는 CloudStorage 아래 GoogleDrive-* 계정 폴더들에서 찾는다.
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

REPO="$(git remote get-url origin)"                     # https://github.com/<owner>/<name>.git
SLUG="${REPO#https://github.com/}"; SLUG="${SLUG%.git}"
SITE="https://${SLUG%%/*}.github.io/${SLUG#*/}"

DRIVE_REL="내 드라이브/[00] 명지중학교/2026년/[08] 사회정서교육 연수/교육청 사회교육자료/emotion-quest-rpg"
DRIVE=""
for d in "$HOME"/Library/CloudStorage/GoogleDrive-*/"$DRIVE_REL"; do
  [ -d "$d" ] && DRIVE="$d" && break
done

echo "== 1. 빌드 =="
npm run build 2>&1 | grep -E "built|error"
BUNDLE=$(ls dist/assets/index-*.js | xargs -n1 basename)
echo "번들: $BUNDLE"

echo "== 2. main 푸시 =="
git push origin main 2>&1 | tail -1 || true

echo "== 3. gh-pages 배포 (히스토리 연속) =="
TMP=$(mktemp -d)
git clone --depth 1 --branch gh-pages "$REPO" "$TMP/gh" 2>&1 | tail -1
rm -rf "$TMP/gh/assets" "$TMP/gh/index.html"
cp -R dist/. "$TMP/gh/"
cd "$TMP/gh"
git add -A
git commit -q -m "deploy: $BUNDLE" || echo "(변경 없음)"
git push origin gh-pages 2>&1 | tail -1
cd "$ROOT"
rm -rf "$TMP"

echo "== 4. 드라이브 동기화 =="
if [ -n "$DRIVE" ]; then
  rsync -a --delete --exclude node_modules --exclude .git "$ROOT/" "$DRIVE/" && echo "synced"
else
  echo "⚠️ 드라이브 폴더를 못 찾아 동기화를 건너뜀 (Google Drive 앱이 켜져 있는지 확인)"
fi

echo "== 5. 배포 반영 대기 =="
for i in $(seq 1 30); do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$SITE/assets/$BUNDLE")
  if [ "$code" = "200" ]; then echo "배포 반영 완료: $BUNDLE"; exit 0; fi
  sleep 20
done
echo "아직 반영 전 (GitHub Pages 지연). gh-pages 브랜치엔 최신이 있으니 곧 반영됩니다."
