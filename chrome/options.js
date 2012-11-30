var OPTIONS = {
    endpoints: {},
    endpointManager: null,

    init: function(){
        // OPTIONS.reinitializeSettings();

        // Get the endpoint manager from the background page
        // and restore saved endpoints.
        chrome.runtime.getBackgroundPage(function(bgPage){
            OPTIONS.endpointManager = bgPage.TC.endpointManager;
            OPTIONS.restore();
        });

        // React to storage changes (which could occur due to the
        // user using Chrome on another box & the changes being
        // synchronized locally).
        chrome.storage.onChanged.addListener(function(changes){
            OPTIONS.displayEndpoints();
        });
    },

    displayEndpoints: function(){
        var nicknames = [];

        for (var nickname in OPTIONS.endpoints){
            nicknames.push(nickname);
        }

        nicknames.sort();
        var data = [];
        for (var i = 0; i < nicknames.length; i++){
            data.push(
                $.extend({index: i}, OPTIONS.endpoints[nicknames[i]])
            );
        }
        
        // Render all endpoints and the create new endpoint forms.
        $('#existing-endpoints').mustache('existing-endpoints',
                                          { endpoints: data },
                                          { method: 'html' }
        );

        // Validate the new server/group form.
        $('input').not('[type=submit]').jqBootstrapValidation({
            submitSuccess: function($form, event){
                event.preventDefault();
                OPTIONS.submit();
            }
        });
        
        // Show tabs on clicks.
        $('#myTab a').click(function (e) {
            e.preventDefault();
            $(this).tab('show');
        });

        // Show the first tab.
        $('#tabs a:first').tab('show');

        var removeCallback = function(nickname){
            return function(evt){
                evt.preventDefault();
                OPTIONS.endpointManager.removeEndpoint(nickname);
                delete OPTIONS.endpoints[nickname];
                OPTIONS.saveEndpoints();
                OPTIONS.displayEndpoints();
            };
        };
        
        var cloneCallback = function(nickname){
            return function(evt){
                evt.preventDefault();
                var endpoint = OPTIONS.endpoints[nickname];
                $('#group').val(endpoint.group);
                $('#nickname').val(endpoint.nickname);
                $('#password').val(endpoint.password);
                $('#passwordConfirm').val(endpoint.password);
                $('#url').val(endpoint.url);
                $('#username').val(endpoint.username);
                $('#tabs a:last').tab('show');
            };
        };
        
        for (i = 0; i < nicknames.length; i++){
            $('#endpointClone_' + i).click(cloneCallback(nicknames[i]));
            $('#endpointDelete_' + i).click(removeCallback(nicknames[i]));
        }

        // Render the introduction section.
        $('#intro').mustache(
            nicknames.length ? 'endpoints-intro' : 'no-endpoints-intro',
            { 
                count: nicknames.length,
                groups: nicknames.length === 1 ? 'group' : 'groups'
            }
        );
    },

    restore: function(){
        // Restore stored settings.
        chrome.storage.sync.get(
            {
                tabcastSettings: {
                    endpoints: {
                        'localhost-test': {
                            group: 'test',
                            nickname: 'localhost-test',
                            url: 'http://localhost:9999'
                        }
                    }
                }
            },
            function(settings){
                var endpoints = settings.tabcastSettings.endpoints;
                for (var nickname in endpoints){
                    var endpoint = endpoints[nickname];
                    OPTIONS.endpointManager.addEndpoint(endpoint);
                }
                OPTIONS.endpoints = settings.tabcastSettings.endpoints;
                OPTIONS.displayEndpoints();
            }
        );
    },

    submit: function(){
        var nickname = $('#nickname'),
            username = $('#username').val(),
            endpoint = {
                group: $('#group').val(),
                nickname: nickname.val(),
                url: $('#url').val()
            };

        if (username.replace(/^\s+|\s+$/g, '')){
            endpoint.username = username;
            endpoint.password = $('#password').val();
        }

        OPTIONS.endpointManager.addEndpoint(endpoint);
        OPTIONS.endpoints[endpoint.nickname] = endpoint;
        OPTIONS.saveEndpoints();
        
        // Clear (only) the nickname field so the user can add another
        // server easily.
        nickname.val('');
        
        // Re-display endpoints.
        OPTIONS.displayEndpoints();
    },
    
    saveEndpoints: function(){
        chrome.storage.sync.set(
            {
                tabcastSettings: {
                    endpoints: OPTIONS.endpoints
                }
            },
            function(items){
                if (chrome.runtime.lastError){
                    alert('Could not save settings! ' +
                          chrome.runtime.lastError.message);
                }
            }
        );
    },

    validateNicknameFromForm: function($elt, nickname, callback){
        callback({
            message: 'Nickname already in use',
            valid: OPTIONS.endpoints[nickname] === undefined,
            value: nickname
        });
    },

    // Unused. See commented-out call in init() above.
    reinitializeSettings: function(){
        chrome.storage.sync.set({
            tabcastSettings: {
                endpoints: {}
            }
        });
    }
};

$(document).ready(function(){
    $.Mustache.load('options-templates.html', function(){
        OPTIONS.init();
    });
});
