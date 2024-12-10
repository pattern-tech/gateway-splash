# Set the base image
FROM node:20.0.0

# WORKDIR /usr/src/app/
WORKDIR /home/gateway

# Dockerfile author / maintainer
LABEL maintainer="Michael Feng <mike@hummingbot.org>"

# Build arguments
LABEL branch=${BRANCH}
LABEL commit=${COMMIT}
LABEL date=${BUILD_DATE}

# Set ENV variables
ENV COMMIT_BRANCH=${BRANCH}
ENV COMMIT_SHA=${COMMIT}
ENV BUILD_DATE=${DATE}
ENV INSTALLATION_TYPE=docker

# Create mount points
RUN mkdir -p /home/gateway/conf /home/gateway/logs /home/gateway/db /home/gateway/certs

# Copy files and Install dependencies
COPY package.json ./
COPY yarn.lock ./
COPY vendor/ ./vendor
RUN yarn install

# compile
COPY . .
RUN yarn build

# Expose port 15888 - note that docs port is 8080
EXPOSE 15888

# Set the default command to run when starting the container
CMD yarn run start