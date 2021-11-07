FROM cloudv/base:latest

# Lambda RIC Dependencies
RUN apt-get install -y g++ \
    unzip \
    libcurl4-openssl-dev \
    autoconf \
    libtool \
    libcurl4-openssl-dev

RUN python3 -m pip install cmake

# Lambda RIE
RUN curl -L https://github.com/aws/aws-lambda-runtime-interface-emulator/releases/download/v1.2/aws-lambda-rie-x86_64 > /rie
RUN chmod +x /rie

# Create Lambda User: Lower privileges and most importantly 4-digit UID/GID
# See: https://github.com/aws/aws-lambda-nodejs-runtime-interface-client/issues/10
RUN groupadd -g 1001 lambda
RUN useradd -r -u 1001 -g lambda lambda
RUN mkdir -p /home/lambda
RUN chown -R lambda:lambda /home/lambda

COPY ./modules/lambda /function/app
RUN chown -R lambda:lambda /function/app

USER lambda

WORKDIR /function/app
RUN yarn

RUN yarn add aws-lambda-ric

WORKDIR /function

# Install done, return to root (needed to run permissions properly)
USER root

ENTRYPOINT [ "sh", "/function/app/entrypoint" ]
CMD [ "app.handler" ] 