# TabPubSub

TabPubSub consists of a browser extension (Chrome only, for now) and a
server. It allows users to do two things:

* Publish the URLs they visit to a TabPubSub server
* Track URLs sent to a TabPubSub server


# Notes on running your own TabPubSub server

The server and extension use version 0.9.11 of socket.io. The client-side
extension Javascript comes from dist/socket.io.min.js in the
socket.io-client repo at https://github.com/LearnBoost/socket.io-client

If you run you own tabcast server, you will need to be compatible with this
version of socket.io or the extension background page will not communicate
properly with your server.
