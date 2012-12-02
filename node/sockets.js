exports.init = function(db, server){

    var io = require('socket.io').listen(server),
        auth = require('./auth.js');

    io.configure('production', function(){
        io.enable('browser client minification');
        io.enable('browser client etag');
        io.enable('browser client gzip');
        io.set('log level', 1);
        io.set('transports', [
            'websocket', 'flashsocket', 'htmlfile', 'xhr-polling', 'jsonp-polling'
        ]);
    });

    io.configure('development', function(){
        io.set('transports', ['websocket']);
        io.set('log level', 1);
    });

    io.sockets.on('connection', function (socket){
        var date = new Date();
        console.log(date.toUTCString() + ' - connection received');
        socket.on('track', function(group){
            console.log('Tracking ' + group);
            socket.join(group);
        });
        
        socket.on('last url', function(group){
            console.log('Last URL request for group ' + group);
            // Send just this socket the last URL (if any) for the group.
            db.zrevrange(
                'group:' + group + ':urls', 0, 1, 'withscores',
                function(err, urls){
                    if (err){
                        console.log('Error getting last URL for group ' + group, err);
                    }
                    else {
                        if (urls.length){
                            socket.emit('url', {
                                date: urls[1],
                                group: group,
                                url: urls[0]
                            });
                        }
                    }
                }
            );
        });

        socket.on('url', function(data){
            console.log('Received url ' + data.url + ' for group ' + data.group);
            auth.checkPassword(data, function(valid){
                if (valid){
                    var date = Date.now();
                    data.date = date;
                    db.zadd('group:' + data.group + ':urls', date, data.url);
                    delete data['password'];
                    io.sockets.in(data.group).emit('url', data);
                }
                else {
                    console.log('Incorrect auth details for user "' + data.username +
                                '" sending url ' + data.url + ' to group ' +
                                data.group);
                    socket.emit('authentication failed', data);
                }
            });
        });
        socket.on('disconnect', function (){
            var date = new Date();
            console.log(date.toUTCString() + ' - client disconnect');
        });
    });
};
