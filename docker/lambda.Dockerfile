FROM cloudv/base:latest AS build

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

COPY . /cloudv
RUN mkdir -p /function

# Resolve symlinks
RUN cp -rL /cloudv/modules/lambda /function/app
RUN cp /cloudv/package.json /cloudv/yarn.lock /function/app

RUN curl -L https://github.com/aws/aws-lambda-runtime-interface-emulator/releases/download/v1.2/aws-lambda-rie-x86_64 > /function/app/rie
RUN chmod +x /function/app/rie

RUN chown -R lambda:lambda /function/app

USER lambda

WORKDIR /function/app
RUN yarn

RUN yarn add aws-lambda-ric

WORKDIR /function

# Install done, return to root (needed for proper permissions)
USER root

# --
FROM cloudv/base:latest

# Lambda RIC Dependencies
RUN apt-get install -y g++ \
    unzip \
    libcurl4-openssl-dev \
    autoconf \
    libtool \
    libcurl4-openssl-dev

COPY --from=build /function/app /function/app

WORKDIR /function

ENTRYPOINT [ "sh", "/function/app/entrypoint" ]
CMD [ "app.handler" ] 