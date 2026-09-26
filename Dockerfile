# 静态站点镜像：nginx 托管壁画修复注胶扫掠校核页面（纯前端，无后端依赖）
FROM nginx:alpine

COPY index.html /usr/share/nginx/html/index.html
COPY css/ /usr/share/nginx/html/css/
COPY js/ /usr/share/nginx/html/js/

# 静态网页健康检查：请求首页失败即判定不健康
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1

EXPOSE 80
