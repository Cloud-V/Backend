FROM cloudv/base:latest

WORKDIR /cloudv
COPY . .
RUN yarn
WORKDIR /cloudv/modules/lambda
RUN sh ./prepare-symlinks.sh
WORKDIR /cloudv

ARG START_COMMAND "yarn start"

RUN echo "${START_COMMAND}" > /start

CMD ["sh", "/start"]