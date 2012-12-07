var tabcast = {
    init: function(){
        $('#install').click(function(evt){
            chrome.webstore.install(
                'https://chrome.google.com/webstore/detail/nknjamdijihneiclbpmcmfklakjkgdpf',
                this.installOK, this.installFailed);
        }.bind(this));
    },
    
    installFailed: function(reason){
        alert('Oops, Tabcast install failed! ' + reason);
    },
    
    installOK: function(){
        $('#install').hide();
    }
};
