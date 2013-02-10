# Tabcast

Tabcast consists of a browser extension (Chrome only, for now) and a
server. It allows users to do two things:

* Publish the URLs they visit to a Tabcast server
* Track URLs sent to a Tabcast server

# Running the server locally

    $ cd node
    $ npm install
    $ NODE_ENV=development node server.js

## Mac OSX notes

You'll at least need the xcode command-line tools for the `npm install` command
above to run successfully. Once you've installed them, run

    $ sudo xcode-select --switch /usr/bin

You'll need Redis running. If you use Homebrew you can install and start Redis
via:

    $ brew install redis
    $ redis-server /usr/local/etc/redis.conf

## Linux notes

On Linux `apt-get install redis-server`.

# Notes on running your own Tabcast server

The server and extension use version 0.9.11 of socket.io. The client-side
extension Javascript comes from dist/socket.io.min.js in the
socket.io-client repo at https://github.com/LearnBoost/socket.io-client

If you run you own Tabcast server, you will need to be compatible with this
version of socket.io or the extension background page will not communicate
properly with your server.

# Chrome / Chromium

## Context menu issue

On older versions of Chrome/Chromium (e.g., 20) there is a bug in the handling
of context menus that causes the extension's Broadcast sub-menu to be repeatedly
populated until the browser runs out of memory and crashes.  Later versions
(e.g., 23) have the bug fixed.

## Getting a modern Chromium on Ubuntu

If you're running on Ubuntu and have an old Chromium you can add a PPA to
track a more recent stable version from
https://launchpad.net/~a-v-shkop/+archive/chromium

    $ sudo apt-add-repository ppa:a-v-shkop/chromium
    $ sudo apt-get update
    $ sudo apt-get upgrade
