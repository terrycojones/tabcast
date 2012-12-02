var TC = {
    init: function(url, group){
        console.log('client loaded. host is ' + url);
        
        var socket = io.connect(url, {
            'force new connection': true
        });
        
        socket.on('connect', function(){
            console.log('connected');
            socket.emit('track', group);

            socket.on('url', function(data){
                console.log('url received', data);
                var date = new Date(parseFloat(data.date));
                $('#urls').prepend(Mustache.render(
                    '<li class="url"><a href="{{url}}">{{url}}</a><br/>{{date}}</li>',
                    {
                        date: date.toUTCString(),
                        url: data.url
                    }
                ));
            });

            socket.on('error', function(e){
                console.log('got Tabcast server socket error:', e);
            });
            
            socket.on('disconnect', function(){
                console.log('Tabcast socket disconnected.');
            });
        });
    }
}
