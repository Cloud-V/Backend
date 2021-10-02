ARG ENTRY_POINT="bin/www"

FROM cloudv/base:latest

# Copy dependency definitions and install dependecies
RUN mkdir -p /tmp/node_cache
WORKDIR /tmp/node_cache
COPY package.json /tmp/node_cache/package.json
RUN yarn install

# Create a directory where our app will be placed
RUN mkdir -p /var/www/CloudV/cloudv

# Change directory so that our commands run inside this new directory
WORKDIR /var/www/CloudV/cloudv
RUN cp -a /tmp/node_cache/node_modules /var/www/CloudV/cloudv 
COPY . /var/www/CloudV/cloudv
WORKDIR /var/www/CloudV/cloudv/modules/lambda
RUN sh ./prepare-symlinks.sh
WORKDIR /var/www/CloudV/cloudv

# Get SCLs
RUN mkdir -p /Stdcells
RUN curl -L https://github.com/Cloud-V/Stdcells/tarball/94625cbab33855014d6abed0a554ae4176b61991 | tar --strip-components=1 -xzC /Stdcells

RUN ln -s /var/www/CloudV/cloudv/${ENTRY_POINT} /entry_point

CMD ["node", "/entry_point"]