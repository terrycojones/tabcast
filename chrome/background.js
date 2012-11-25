var TC = {
    init: function(){
        var shared = {},
            endpointManager = this.EndpointManager(shared);
        
        this.TabManager(shared).init();

        endpointManager.addEndpoint({
            group: 'public',
            nickname: 'httpkit',
            url: 'http://echo.httpkit.com/'
        });
        
        endpointManager.addEndpoint({
            group: 'test',
            nickname: 'jon.es/test',
            password: 'password',
            url: 'http://jon.es:9999',
            username: 'username'
        });
    }
};

// ------------------------------ SOCKETS ------------------------------
(function(obj){
    obj.SocketManager = function(url, nickname, callback){
        var refCount = 0;
        var socket = null;
        
        var get = function(){
            if (socket === null){
                socket = io.connect(url);
                if (callback){
                    socket.on('url', function(data){
                        console.log('received url data', data);
                        callback(data);
                    });
                }
                socket.on('connect', function (){
                    console.log('socket connected for ' + nickname);
                });
                socket.on('disconnect', function() {
                    console.log('socket disconnected for ' + nickname);
                });
            }
            refCount++;
            return socket;
        };
        
        var disconnect = function(){
            if (socket){
                socket.disconnect();
                socket = null;
                refCount = 0;
            }
        };
        
        var release = function(){
            if (refCount <= 0){
                console.log('Reference count (' + refCount +
                            ') incorrect in socketManager release method.');
            }
            else {
                refCount--;
                if (refCount === 0){
                    disconnect();
                }
            }
        };
        
        return {
            disconnect: disconnect,
            get: get,
            release: release
        };
    };
})(TC);


// ------------------------------ ENDPOINTS ------------------------------
(function(obj){
    obj.EndpointManager = function(shared){
        var endpoints = {};
        shared.endpoints = endpoints;

        var addEndpoint = function(options){
            var nickname = options.nickname,
                url = options.url;
            
            // Endpoint URLs must end in a slash.
            url += (options.url.charAt(options.url.length - 1) === '/' ?
                    '' : '/');

            var contextMenuId = chrome.contextMenus.create({
                checked: false,
                title: nickname,
                contexts: ['all'],
                type: 'checkbox',
                onclick : function(info, tab){
                    shared.contextMenuClick(nickname, info, tab);
                }
            });

            endpoints[nickname] = {
                broadcastingSocket: obj.SocketManager(url, nickname),
                contextMenuId: contextMenuId,
                group: options.group,
                trackingSocket: obj.SocketManager(url, nickname, function(data){
                    shared.urlReceived(nickname, data);
                }),
                url: url,
                username: options.username,
                password: options.password
            };
            
            shared.endpointAdded(nickname);
        };

        var removeEndpoint = function(nickname){
            shared.endpointRemoved(nickname);
            chrome.contextMenus.remove(endpoints[nickname].contextMenuId);
            endpoints[nickname].broadcastingSocket.disconnect();
            endpoints[nickname].trackingSocket.disconnect();
            delete endpoints[nickname];
        };
        
        return {
            addEndpoint: addEndpoint,
            removeEndpoint: removeEndpoint
        };
    };
})(TC);


// ------------------------------ TABS ------------------------------
(function(obj){
    obj.TabManager = function(shared){
        var tabs = {},
            broadcastingBadgeBackgroundColor = '#F00',
            trackingBadgeBackgroundColor = '#0F0',
            trackingBadgeText = 'auto';

        var init = function(){
            chrome.tabs.onCreated.addListener(function(tab){
                var broadcastSocket = {};
                for (var nickname in shared.endpoints){
                    broadcastSocket[nickname] = null;
                };
                tabs[tab.id] = {
                    broadcastSocket: broadcastSocket,
                    tracking: null
                };
                updateBadge(tab.id);
            });

            // When a tab is removed, it must release any tracking or
            // broadcasting sockets it has in use.
            chrome.tabs.onRemoved.addListener(function(tabId){
                if (tabs[tabId].tracking){
                    shared.endpoints[tabs[tabId].tracking.nickname]
                        .trackingSocket.release();
                }
                else {
                    var broadcastSocket = tabs[tabId].broadcastSocket;
                    for (var nickname in shared.endpoints){
                        if (broadcastSocket[nickname] !== null){
                            shared.endpoints[nickname]
                                .broadcastingSocket.release();
                        }
                    };
                }
                delete tabs[tabId];
            });

            // When a tab loads a URL, check to see if it's visiting one of
            // our endpoints. If not, broadcast the URL to the endpoints
            // that are active for the tab.
            
            chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab){
                if (changeInfo.status === 'loading'){
                    if (tabs[tabId].tracking){
                        // This tab is tracking an endpoint.
                        if (tab.url !== tabs[tabId].tracking.url){
                            // For some reason (probably user intervention)
                            // the tab is opening a URL that is not the one
                            // it was supposed to open next. Stop tracking.
                            shared.endpoints[tabs[tabId].tracking.nickname]
                                .trackingSocket.release();
                            tabs[tabId].tracking = null;
                            updateBadge(tabId);
                        }
                    }
                    else {
                        var tracking = checkIfTabIsOpeningAnEndpoint(tab);
                        if (tracking){
                            // When a tab is tracking it can't be broadcasting.
                            // Set the broadcastSocket of all endpoints for
                            // this tab to null.
                            for (var nickname in shared.endpoints){
                                if (tabs[tabId].broadcastSocket[nickname] !== null){
                                    shared.endpoints[nickname]
                                        .broadcastingSocket.release();
                                    tabs[tabId].broadcastSocket[nickname] = null;
                                }
                            }
                            tabs[tabId].tracking = tracking;
                            track(tabId);
                            updateBadge(tabId);
                        }
                        else {
                            // No tracking involved, broadcast to any
                            // relevant endpoints.
                            var broadcastSocket = tabs[tab.id].broadcastSocket;
                            for (nickname in shared.endpoints){
                                if (broadcastSocket[nickname] !== null){
                                    broadcast(tab, nickname);
                                }
                            }
                        }
                    }
                }
            });

            // When a tab becomes active, update the context menu so it shows
            // its broadcast status for each of the endpoints.
            chrome.tabs.onActivated.addListener(function(activeInfo){
                var nickname;
                if (tabs[activeInfo.tabId].tracking){
                    // An endpoint is being tracked, so all broadcast
                    // context menu items should be shown as disabled.
                    for (nickname in shared.endpoints){
                        chrome.contextMenus.update(
                            shared.endpoints[nickname].contextMenuId, { 
                                checked: false,
                                enabled: false
                            });
                    }
                }
                else {
                    var broadcastSocket = tabs[activeInfo.tabId].broadcastSocket;
                    for (nickname in shared.endpoints){
                        chrome.contextMenus.update(
                            shared.endpoints[nickname].contextMenuId, { 
                                checked: broadcastSocket[nickname] !== null,
                                enabled: true
                            });
                    }
                }
                updateBadge(activeInfo.tabId);
            });

            // Set all existing tabs to have a false broadcast socket value
            // for all known endpoints, and a null tracking value.
            chrome.tabs.query({}, function(existingTabs){
                for (var i = 0; i < existingTabs.length; i++){
                    var broadcastSocket = {};
                    for (var nickname in shared.endpoints){
                        broadcastSocket[nickname] = null;
                    }
                    tabs[existingTabs[i].id] = {
                        broadcastSocket: broadcastSocket,
                        tracking: null
                    };
                    updateBadge(existingTabs[i].id);
                }
            });
        };
        
        var broadcast = function(tab, nickname){
            // Send the URL being opened by a tab to the endpoint with nickname.
            var endpoint = shared.endpoints[nickname];
            console.log('tab ' + tab.id + ' broadcasts ' + tab.url + ' to ' + nickname);
            tabs[tab.id].broadcastSocket[nickname].emit('url', {
                group: endpoint.group,
                password: endpoint.password,
                url: tab.url,
                username: endpoint.username
            });
        };

        var checkIfTabIsOpeningAnEndpoint = function(tab){
            // Figure out if a tab is opening a URL at one of our
            // endpoints.  If so, return the endpoint's nickname and the
            // name of the group being accessed.
            for (var nickname in shared.endpoints){
                var trackPrefix = shared.endpoints[nickname].url + 'track/';
                if (tab.url.indexOf(trackPrefix) === 0){
                    return {
                        group: tab.url.substr(trackPrefix.length),
                        nickname: nickname
                    };
                }
            }
            return null;
        };

        var track = function(tabId){
            // Set the passed tab up to track a group on an endpoint.
            var tab = tabs[tabId],
                nickname = tab.tracking.nickname,
                group = tab.tracking.group,
                socket = shared.endpoints[nickname].trackingSocket.get();
            console.log('Tab visits endpoint ' + nickname);
            socket.emit('track', group);
            tab.tracking.socket = socket;
            tab.tracking.url = shared.endpoints[nickname].url + 'track/' + group;
        };
        
        var updateBadge = function(tabId){
            if (tabs[tabId].tracking){
                chrome.browserAction.setBadgeBackgroundColor({
                    color: trackingBadgeBackgroundColor
                });
                chrome.browserAction.setBadgeText({
                    tabId: tabId,
                    text: trackingBadgeText
                });
            }
            else {
                var broadcastingCount = 0,
                    broadcastSocket = tabs[tabId].broadcastSocket;
                for (var nickname in shared.endpoints){
                    if (broadcastSocket[nickname] !== null){
                        broadcastingCount++;
                    }
                }
                chrome.browserAction.setBadgeBackgroundColor({
                    color: broadcastingBadgeBackgroundColor
                });
                chrome.browserAction.setBadgeText({
                    tabId: tabId,
                    text: broadcastingCount ? '' + broadcastingCount : ''
                });
            }
        };
        
        shared.contextMenuClick = function(nickname, info, tab){
            if (info.checked){
                tabs[tab.id].broadcastSocket[nickname] = 
                    shared.endpoints[nickname].broadcastingSocket.get();
                broadcast(tab, nickname);
            }
            else {
                shared.endpoints[nickname].broadcastingSocket.release();
                tabs[tab.id].broadcastSocket[nickname] = null;
            }
            updateBadge(tab.id);
        };
        
        shared.endpointAdded = function(nickname){
            for (var tabId in tabs){
                tabs[tabId].broadcastSocket[nickname] = false;
            };
        };
        
        shared.endpointRemoved = function(nickname){
            for (var tabId in tabs){
                var tab = tabs[tabId];
                if (tab.tracking){
                    if (tab.tracking.nickname === nickname){
                        shared.endpoints[nickname].trackingSocket.release();
                        tab.tracking = null;
                    }
                }
                else if (tab.broadcastSocket[nickname] !== null){
                    shared.endpoints[nickname].broadcastingSocket.release();
                }
                delete tab.broadcastSocket[nickname];
                updateBadge(tabId);
            }
        };
        
        shared.urlReceived = function(nickname, data){
            console.log('URL received ' + nickname, data);
            for (var tabId in tabs){
                var tab = tabs[tabId],
                    tracking = tab.tracking;
                if (tracking &&
                    tracking.nickname === nickname &&
                    tracking.group === data.group){
                    console.log('Tracking tab received data for nickname ' + nickname, data, tabId);
                    tracking.url = data.url;
                    chrome.tabs.update(parseInt(tabId, 10), {
                        url: data.url
                    });
                }
                else {
                    if (tracking){
                        console.log('tab received non-matching data for nickname ' + nickname, data, tracking);
                    }
                }
            }
        };
        
        return {
            init: init
        };
    };
})(TC);

TC.init();
