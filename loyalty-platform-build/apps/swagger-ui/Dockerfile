FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html /usr/share/nginx/html/index.html
COPY specs/ /usr/share/nginx/html/specs/
EXPOSE 8080
