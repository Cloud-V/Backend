FROM cloudv/base:latest

WORKDIR /cloudv
COPY . .
RUN yarn
WORKDIR /cloudv

ARG START_COMMAND="yarn start"

RUN echo "${START_COMMAND}" > /start

CMD ["sh", "/start"]