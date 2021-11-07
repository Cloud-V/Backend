FROM cloudv/base:latest

ARG FUNCTION_DIR="/function"

RUN python3 -m pip install --target ${FUNCTION_DIR} awslambdaric

COPY ./modules/lambda ${FUNCTION_DIR}

WORKDIR ${FUNCTION_DIR}
RUN yarn

ENTRYPOINT [ "/opt/bitnami/python/bin/python3", "-m", "awslambdaric" ]
CMD [ "app.handler" ]