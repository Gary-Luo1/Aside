#!/bin/sh
# 重新生成 public/fonts/gochi-hand.woff2 的子集版本。
#
# 该字体（Gochi Hand）只用于渲染 "aside" 这 5 个字母：
#   - content/ui/styles.css  .card-header .kicker
#   - options/styles.css     .wordmark
# 因此只需保留 a s i d e 五个字形，完整字体 19.9KB 可压到约 1.3KB。
# content.js 以 dataurl 内联该字体且注入到所有 frame，体积直接影响注入开销。
#
# 若将来要用该字体显示其他文字，把新增字符加进 --text 后重跑本脚本。
#
# 依赖：pip install fonttools brotli

set -eu
cd "$(dirname "$0")"

pyftsubset assets/gochi-hand-full.woff2 \
  --text="aside" \
  --flavor=woff2 \
  --layout-features='' \
  --no-hinting \
  --desubroutinize \
  --output-file=../public/fonts/gochi-hand.woff2

echo "Regenerated: public/fonts/gochi-hand.woff2"
