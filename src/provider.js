const IFRAME_VERSION = 'v1.0.0';
const IS_DEV = false; // Currently just used for local development of the SDK itself.
const ELPH_ORIGIN = (IS_DEV ? 'http://localhost:8000' : 'https://elph.com');
const SDK_ELPH_ORIGIN = (IS_DEV ? 'http://localhost:9000' : 'https://sdk.elph.com');

// Set of methods that need to be rejected if we're un-auth'd.
const AUTHENTICATED_METHODS = ['eth_sendTransaction', 'eth_sign', 'personal_sign', 'eth_coinbase', 'eth_accounts']

class ElphProvider {
    constructor(options={'network' : 'mainnet'}) {
        this.removeOldIframes();

        this.initializeOptions(options);
        this.initializeState();
        this.initializeListener();

        this.attemptReauthenticate();

        this.initializeIframe();
        this.initializeModalFrame();
    }

    removeOldIframes() {
        let oldModalIframe = document.getElementById('modalIframe');
        oldModalIframe && oldModalIframe.parentNode.removeChild(oldModalIframe);

        let oldWeb3Iframe = document.getElementById('web3Iframe');
        oldWeb3Iframe && oldWeb3Iframe.parentNode.removeChild(oldWeb3Iframe);
    }


    initializeOptions(options) {
        this.options = options;
        this.options['elphAuthenticated'] = localStorage.getItem('elphAuthenticated');
        this.options['title'] = document.title;
    }

    initializeState() {
        this.isElph = true;
        this.authenticated = false;
        this.requests = {};
        this.subscriptions = [];
        this.account = undefined;
        this.net_version = undefined;
    }

    initializeListener() {
        var that = this;
        window.addEventListener('message', function(e) {
            if (!that.iframe.contentWindow) return;
            if (e.origin === SDK_ELPH_ORIGIN) {
                if (e.data.type === "GET_OPTIONS") {
                    that.iframe.contentWindow.postMessage({ type: "SET_OPTIONS", payload: that.options }, SDK_ELPH_ORIGIN);
                } else if (e.data.type === "AUTHENTICATED") {
                    that.authenticated = true;
                    that.account = e.data.account;
                    that.net_version = e.data.net_version;
                    localStorage.setItem('elphAuthenticated', true);
                } else if (e.data.type === "RESULT") {
                    that.runCallback(e.data.payload.id, e.data.error, e.data.result);
                } else if (e.data.type === "SUBSCRIPTION_RESULT") {
                    for (var i = 0; i < that.subscriptions.length; i++) {
                        that.subscriptions[i](e.data.result);
                    }
                } else if (e.data.type === "SHOW_MODAL_IFRAME") {
                    that.modalIframe.style.display = 'block';
                } else if (e.data.type === "HIDE_MODAL_IFRAME") {
                    that.modalIframe.style.display = 'none';
                } else {
                    // console.log("got an unknown response back: ", e.data.type);
                }
            }
        });
    }

    attemptReauthenticate() {
        if (this.hasPreviouslyAuthenticated()) {
            this.login();
        }
    }

    isAuthenticated() {
        return this.authenticated;
    }

    hasPreviouslyAuthenticated() {
        return localStorage.getItem('elphAuthenticated') === "true";
    }

    logout() {
        this.removeOldIframes();
        localStorage.removeItem('elphAuthenticated');
        this.initializeState();
    }

    login() {
        this.handleRegistration();
    }

    handleRegistration() {
        if (!this.hasPreviouslyAuthenticated()) {
            window.open(ELPH_ORIGIN + '/register','register','resizable,height=650,width=850,left=400,top=200');
        }
    }

    initializeIframe() {
        this.iframe = document.createElement('iframe');
        this.iframe.src = SDK_ELPH_ORIGIN + '/iframes/' + IFRAME_VERSION + '/web3.html?' + Date.now().toString();
        this.iframe.style.border = 0;
        this.iframe.style.position = "absolute";
        this.iframe.style.width = 0;
        this.iframe.style.height = 0;
        this.iframe.style.zIndex = -100;
        this.iframe.id = "web3Iframe";
        document.body.appendChild(this.iframe);
    }

    initializeModalFrame() {
        this.modalIframe = document.createElement('iframe');   
        this.modalIframe.src = SDK_ELPH_ORIGIN + '/iframes/' + IFRAME_VERSION + '/modal.html?' + Date.now().toString();
        this.modalIframe.style.position = "absolute";  
        this.modalIframe.style.border = 0; 
        this.modalIframe.style.top = 0;    
        this.modalIframe.style.left = 0;   
        this.modalIframe.style.width = '100%'; 
        this.modalIframe.style.height = '100%';
        this.modalIframe.style.display = 'none';   
        this.modalIframe.style.zIndex = '10000000';    
        this.modalIframe.allowTransparency="true"; 
        this.modalIframe.id = "modalIframe";
        document.body.appendChild(this.modalIframe);   
    }

    on(type, callback) {
        this.subscriptions.push(callback);
    }

    runCallback(id, error, result) {
        var callback = this.requests[id].callback;
        if (error) {
            callback(error, null);
        } else {
            callback(null, result);
        }
        delete this.requests[id];
    }

    sendAsync(payload, callback) {
        this.requests[payload.id] = { payload: payload, callback: callback };

        if (!this.authenticated && AUTHENTICATED_METHODS.includes(payload.method)) {
            this.runCallback(payload.id, 'User is not authenticated.', null);
            return;
        }

        this.iframe.contentWindow.postMessage({ type: "REQUEST", payload: payload }, SDK_ELPH_ORIGIN);
    }

    send(payload) {
        var method = payload.method;
        var result;
        switch(method) {
            case "eth_accounts":
                result = this.account ? [this.account] : [];
                break;
            case "eth_coinbase":
                result = this.account ? [this.account] : [];
                break;
            case "eth_uninstallFilter":
                // TODO
                result = true;
                break;
            case "net_version":
                result = this.net_version;
                break;
            default:
                console.warn("Received synchronous method that is unsupported: ", payload);
                throw new Error("Unsupported synchronous method");
                break;
        }
        return {
            id: payload.id,
            jsonrpc: payload.jsonrpc,
            result: result
        };
    }
}

export default ElphProvider;
