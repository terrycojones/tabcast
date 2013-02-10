# Tabcast

Tabcast is designed to get streams of URLs into and out of your
browser. The following is currently supported, on a per-tab
basis:

     * Send all a tab's URLs to a (Tabcast server) group.
     * Passively follow URLs sent to a group by other Tabcast users.
     * Actively share control of a group browsing session.
     * Monitor the real-time URL history of a group.

Obvious initial uses involve shared browser sessions,
for example during conference calls.

 Although this initial set of possible actions is interesting and
 useful, the wider goal is to make it possible for others to
 easily implement their ideas around browser URL streams. Tabcast
 is open source, which allows you to run a server locally and to
 customize it to add your own functionality. Possible  uses run
 from the very simple, such as a local server that simply saves
 URL visits to a file, to much richer possibilities around
 browsing, collaboration, discovery, research, and analysis.

 For a more useful description, visit (tabcast.net)[http://tabcast.net].

 Below are some rough technical notes.

# Running the server locally

    $ cd node
    $ npm install
    $ NODE_ENV=development node server.js

## Mac OSX

You'll at least need the xcode command-line tools for the `npm install` command
above to run successfully. Once you've installed them, run

    $ sudo xcode-select --switch /usr/bin

You'll need Redis running. If you use Homebrew you can install and start Redis
via:

    $ brew install redis
    $ redis-server /usr/local/etc/redis.conf

## Linux

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
