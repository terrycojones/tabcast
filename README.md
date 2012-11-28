# Tabcast

Tabcast consists of a browser extension (Chrome only, for now) and a
server. It allows users to do two things:

* Publish the URLs they visit to a Tabcast server
* Track URLs sent to a Tabcast server


# Notes on running your own Tabcast server

The server and extension use version 0.9.11 of socket.io. The client-side
extension Javascript comes from dist/socket.io.min.js in the
socket.io-client repo at https://github.com/LearnBoost/socket.io-client

If you run you own tabcast server, you will need to be compatible with this
version of socket.io or the extension background page will not communicate
properly with your server.

# Chrome context menu issue

On older versions of Chrome/Chromium (e.g., 20) there is a bug in the
handling of context menus that causes the extension's Broadcast sub-menu to
be repeatedly populated until (I think) the browser runs out of memory and
crashes.  Later versions (e.g. 23) have the bug fixed.

## Fix for Ubuntu / Chromium

If you're running on Ubuntu and have an old Chromium you can add a PPA to
track a more recent stable version from
https://launchpad.net/~a-v-shkop/+archive/chromium

    $ sudo apt-add-repository ppa:a-v-shkop/chromium
    $ sudo apt-get update
    $ sudo apt-get upgrade
