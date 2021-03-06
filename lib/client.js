// Generated by CoffeeScript 1.9.3
var Client, Crypto, HTTPS, Iconv, QS, RSA, XML;

HTTPS = require('https');

Crypto = require('crypto');

RSA = require('ursa');

Iconv = require('iconv-lite');

XML = require('nice-xml');

QS = require('qs');

Client = (function() {
  var CIPHER_IV, CIPHER_KEY_LENGTH, CIPHER_NAME, REQUEST_PREFIX, RESPONSE_MARKER, _encryptKey;

  Client.SERVER_NAME = 'w.qiwi.com';

  Client.SERVER_PORT = 443;

  Client.REQUEST_CHARSET = 'utf-8';

  Client.RESPONSE_MAX_SIZE = 1024 * 1024;

  CIPHER_NAME = 'aes-256-cbc';

  CIPHER_IV = new Buffer([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);

  CIPHER_KEY_LENGTH = 32;

  REQUEST_PREFIX = 'v3.qiwi-';

  RESPONSE_MARKER = 'B64\n';

  function Client(options) {
    this._host = this.constructor.SERVER_NAME;
    this._port = this.constructor.SERVER_PORT;
    this._charset = this.constructor.REQUEST_CHARSET;
    this._headers = Object.create(null);
    this._extra = Object.create(null);
    this._session = null;
    this._token = null;
    this._terminalId = null;
  }

  _encryptKey = function(publicKey, nonce, aesKey) {
    var blob;
    blob = new Buffer(2 + nonce.length + aesKey.length);
    blob[0] = nonce.length;
    nonce.copy(blob, 1);
    blob[1 + nonce.length] = aesKey.length;
    aesKey.copy(blob, 1 + nonce.length + 1);
    return publicKey.encrypt(blob, null, 'base64', RSA.RSA_PKCS1_PADDING);
  };

  Client.prototype._encryptBody = function(data) {
    var blob, cipher;
    cipher = Crypto.createCipheriv(CIPHER_NAME, this._session.key, CIPHER_IV);
    cipher.end(data);
    blob = cipher.read();
    return REQUEST_PREFIX + this._session.id + '\n' + blob.toString('base64');
  };

  Client.prototype._decryptBody = function(text) {
    var decipher;
    decipher = Crypto.createDecipheriv(CIPHER_NAME, this._session.key, CIPHER_IV);
    decipher.end(text, 'base64');
    return decipher.read();
  };

  Client.prototype._requestOptions = function(endpoint, body) {
    var fullHeaders, headers, key, options, path, ref, value;
    path = '/xml/xmlutf_' + endpoint + '.jsp';
    headers = {
      'Content-Type': 'application/x-www-form-urlencoded; charset=' + this._charset,
      'Content-Length': body.length
    };
    fullHeaders = Object.create(null);
    ref = this._headers;
    for (key in ref) {
      value = ref[key];
      fullHeaders[key] = value;
    }
    for (key in headers) {
      value = headers[key];
      fullHeaders[key] = value;
    }
    options = {
      host: this._host,
      port: this._port,
      method: 'POST',
      path: path,
      headers: fullHeaders
    };
    return options;
  };

  Client.prototype._responseHandler = function(callback) {
    return (function(_this) {
      return function(response) {
        var chunks;
        chunks = [];
        response.on('readable', function() {
          var chunk;
          chunk = response.read();
          if (chunk != null) {
            chunks.push(chunk);
          }
        });
        response.on('end', function() {
          var body, error, output, text;
          body = Buffer.concat(chunks);
          text = Iconv.decode(body, 'utf-8');
          if (text.slice(0, 4) === RESPONSE_MARKER) {
            text = Iconv.decode(_this._decryptBody(text.slice(4)), 'utf-8');
          }
          try {
            output = XML.parse(text);
            callback(null, output.response);
          } catch (_error) {
            error = _error;
            callback(error);
          }
        });
      };
    })(this);
  };

  Client.prototype.setHeader = function(name, value) {
    this._headers[name] = value;
    return this;
  };

  Client.prototype.removeHeader = function(name) {
    delete this._headers[name];
    return this;
  };

  Client.prototype.sendInit = function(input, callback) {
    var blob, request;
    blob = Iconv.encode(QS.stringify(input), this._charset);
    request = HTTPS.request(this._requestOptions('newcrypt_init_session', blob));
    request.on('response', this._responseHandler(callback));
    request.on('error', function(error) {
      if (typeof callback === "function") {
        callback(error);
      }
    });
    request.end(blob);
    return this;
  };

  Client.prototype.createSession = function(publicKey, callback) {
    publicKey = RSA.createPublicKey(publicKey);
    this.sendInit({
      command: 'init_start'
    }, (function(_this) {
      return function(error, output) {
        var aesKey, encryptedKey, input, serverNonce, sessionId;
        sessionId = output.session_id;
        serverNonce = new Buffer(output.init_hs, 'base64');
        aesKey = Crypto.randomBytes(CIPHER_KEY_LENGTH);
        encryptedKey = _encryptKey(publicKey, serverNonce, aesKey);
        input = {
          command: 'init_get_key',
          session_id: sessionId,
          key_v: 2,
          key_hs: encryptedKey
        };
        _this.sendInit(input, function(error) {
          var session;
          if (error == null) {
            session = {
              id: sessionId,
              key: aesKey
            };
            if (typeof callback === "function") {
              callback(null, session);
            }
          } else {
            if (typeof callback === "function") {
              callback(error);
            }
          }
        });
      };
    })(this));
    return this;
  };

  Client.prototype.setSession = function(session) {
    this._session = session;
    return this;
  };

  Client.prototype.removeSession = function() {
    this._session = null;
    return this;
  };

  Client.prototype.invokeMethod = function(name, input, callback) {
    var blob, envelope, extra, item, key, ref, request, value;
    envelope = {
      request: {
        'request-type': name
      }
    };
    extra = [];
    ref = this._extra;
    for (key in ref) {
      value = ref[key];
      extra.push({
        $: {
          name: key
        },
        $text: value
      });
    }
    if (extra.length) {
      envelope.request.extra = extra;
    }
    for (key in input) {
      value = input[key];
      item = envelope.request[key];
      if (item == null) {
        envelope.request[key] = value;
      } else if (Array.isArray(item)) {
        item.push(value);
      } else {
        envelope.request[key] = [item, value];
      }
    }
    blob = Iconv.encode(XML.stringify(envelope), this._charset);
    blob = Iconv.encode(this._encryptBody(blob), this._charset);
    request = HTTPS.request(this._requestOptions('newcrypt', blob));
    request.on('response', this._responseHandler(callback));
    request.on('error', function(error) {
      if (typeof callback === "function") {
        callback(error);
      }
    });
    request.end(blob);
    return this;
  };

  Client.prototype.setExtra = function(name, value) {
    this._extra[name] = value;
    return this;
  };

  Client.prototype.removeExtra = function(name) {
    delete this._extra[name];
    return this;
  };

  Client.prototype.receiveToken = function(input, callback) {
    var fullInput, key, value;
    fullInput = {
      'client-id': 'android',
      'auth-version': '2.0'
    };
    for (key in input) {
      value = input[key];
      if (value !== void 0) {
        fullInput[key] = value;
      }
    }
    return this.invokeMethod('oauth-token', fullInput, callback);
  };

  Client.prototype.setAccess = function(token, terminalId) {
    this._token = token;
    this._terminalId = terminalId;
    return this;
  };

  Client.prototype.removeAccess = function() {
    this._token = null;
    this._terminalId = null;
    return this;
  };

  Client.prototype.accountInfo = function(callback) {
    var fullInput;
    fullInput = {
      'terminal-id': this._terminalId,
      extra: {
        $: {
          name: 'token'
        },
        $text: this._token
      }
    };
    return this.invokeMethod('ping', fullInput, callback);
  };

  Client.prototype.chargeList = function(input, callback) {
    var fullInput;
    fullInput = {
      'terminal-id': this._terminalId,
      extra: {
        $: {
          name: 'token'
        },
        $text: this._token
      },
      check: {
        payment: input
      }
    };
    return this.invokeMethod('pay', fullInput, callback);
  };

  Client.prototype.operationReport = function(input, callback) {
    var fullInput, key, value;
    fullInput = {
      'terminal-id': this._terminalId,
      extra: {
        $: {
          name: 'token'
        },
        $text: this._token
      }
    };
    for (key in input) {
      value = input[key];
      if (value !== void 0) {
        fullInput[key] = value;
      }
    }
    return this.invokeMethod('get-payments-report', fullInput, callback);
  };

  Client.prototype.makePayment = function(input, callback) {
    var fullInput;
    fullInput = {
      'terminal-id': this._terminalId,
      extra: {
        $: {
          name: 'token'
        },
        $text: this._token
      },
      auth: {
        payment: input
      }
    };
    return this.invokeMethod('pay', fullInput, callback);
  };

  return Client;

})();

module.exports = Client;
