FROM cloudv/base:latest

ARG FUNCTION_DIR="/function"

# Lambda RIC Dependencies
RUN apt-get install -y g++ \
    unzip \
    libcurl4-openssl-dev \
    autoconf \
    libtool \
    libcurl4-openssl-dev

RUN python3 -m pip install cmake


# Create Lambda User: Lower privileges and most importantly 4-digit UID/GID
# See: https://github.com/aws/aws-lambda-nodejs-runtime-interface-client/issues/10
RUN groupadd -g 1001 lambda
RUN useradd -r -u 1001 -g lambda lambda
RUN mkdir -p /home/lambda
RUN chown -R lambda:lambda /home/lambda

COPY ./modules/lambda ${FUNCTION_DIR}
RUN chown -R lambda:lambda ${FUNCTION_DIR}

USER lambda

WORKDIR ${FUNCTION_DIR}
RUN yarn

RUN yarn add aws-lambda-ric

ENTRYPOINT [ "/opt/bitnami/node/bin/npx", "aws-lambda-ric" ]
CMD [ "app.handler" ]