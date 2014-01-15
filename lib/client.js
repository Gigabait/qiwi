// Generated by CoffeeScript 1.6.3
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

  CIPHER_NAME = 'aes-256-cbc';

  CIPHER_IV = new Buffer([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);

  CIPHER_KEY_LENGTH = 32;

  REQUEST_PREFIX = 'v3.qiwi-';

  RESPONSE_MARKER = 'B64\n';

  function Client() {
    this._host = this.constructor.SERVER_NAME;
    this._port = this.constructor.SERVER_PORT;
    this._charset = this.constructor.REQUEST_CHARSET;
    this._extra = Object.create(null);
    this._session = null;
    this._token = null;
  }

  _encryptKey = function(publicKey, nonce, aesKey) {
    var blob, encodedKey;
    blob = new Buffer(2 + nonce.length + aesKey.length);
    blob[0] = nonce.length;
    nonce.copy(blob, 1);
    blob[1 + nonce.length] = aesKey.length;
    aesKey.copy(blob, 1 + nonce.length + 1);
    return encodedKey = publicKey.encrypt(blob, null, 'base64', RSA.RSA_PKCS1_PADDING);
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
    var headers, options, path;
    path = '/xml/xmlutf_' + endpoint + '.jsp';
    headers = {
      'Content-Type': 'application/x-www-form-urlencoded; charset=' + this._charset,
      'Content-Length': body.length
    };
    options = {
      host: this._host,
      port: this._port,
      method: 'POST',
      path: path,
      headers: headers
    };
    return options;
  };

  Client.prototype._responseHandler = function(callback) {
    var _this = this;
    return function(response) {
      var chunks;
      chunks = [];
      response.on('readable', function() {
        chunks.push(response.read());
        return void 0;
      });
      response.on('end', function() {
        var body, output, text;
        body = Buffer.concat(chunks);
        text = Iconv.decode(body, 'utf-8');
        if (text.slice(0, 4) === RESPONSE_MARKER) {
          text = Iconv.decode(_this._decryptBody(text.slice(4)), 'utf-8');
        }
        output = XML.parse(text);
        callback(null, output.response);
        return void 0;
      });
      return void 0;
    };
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
      return void 0;
    });
    request.end(blob);
    return this;
  };

  Client.prototype.createSession = function(publicKey, callback) {
    var _this = this;
    publicKey = RSA.createPublicKey(publicKey);
    this.sendInit({
      command: 'init_start'
    }, function(error, output) {
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
        return void 0;
      });
      return void 0;
    });
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
    var blob, envelope, extra, key, request, value, _ref;
    envelope = {
      request: {
        'request-type': name
      }
    };
    extra = [];
    _ref = this._extra;
    for (key in _ref) {
      value = _ref[key];
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
      envelope.request[key] = value;
    }
    blob = Iconv.encode(XML.stringify(envelope), this._charset);
    blob = Iconv.encode(this._encryptBody(blob), this._charset);
    request = HTTPS.request(this._requestOptions('newcrypt', blob));
    request.on('response', this._responseHandler(callback));
    request.on('error', function(error) {
      if (typeof callback === "function") {
        callback(error);
      }
      return void 0;
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
    input = {
      'client-id': 'android',
      'auth-version': '2.0',
      phone: input.phone,
      password: input.password,
      code: input.code,
      vcode: input.vcode
    };
    return this.invokeMethod('oauth-token', input, callback);
  };

  Client.prototype.setToken = function(token) {
    this._token = token;
    return this;
  };

  Client.prototype.removeToken = function() {
    this._token = null;
    return this;
  };

  Client.prototype.balanceInfo = function(callback) {
    var input;
    input = {
      'terminal-id': this._token.owner,
      extra: {
        $: {
          name: 'token'
        },
        $text: this._token.value
      }
    };
    return this.invokeMethod('ping', input, callback);
  };

  Client.prototype.favouriteList = function(callback) {
    var input;
    input = {
      'terminal-id': this._token.owner,
      extra: {
        $: {
          name: 'token'
        },
        $text: this._token.value
      }
    };
    return this.invokeMethod('get-ab', input, callback);
  };

  Client.prototype.operationReport = function(input, callback) {
    var data;
    data = {
      'terminal-id': this._token.owner,
      extra: {
        $: {
          name: 'token'
        },
        $text: this._token.value
      },
      period: 'today',
      full: 1,
      period: 'custom',
      'from-date': '25.12.2013',
      'to-date': '08.01.2014'
    };
    return this.invokeMethod('get-payments-report', data, callback);
  };

  Client.prototype.makePayment = function(input, callback) {
    input = {
      'terminal-id': this._token.owner,
      extra: {
        $: {
          name: 'token'
        },
        $text: this._token.value
      },
      auth: {
        payment: input
      }
    };
    return this.invokeMethod('pay', input, callback);
  };

  Client.prototype.checkPayment = function(input, callback) {
    input = {
      'terminal-id': this._token.owner,
      extra: {
        $: {
          name: 'token'
        },
        $text: this._token.value
      },
      check: {
        payment: input
      }
    };
    return this.invokeMethod('pay', input, callback);
  };

  return Client;

})();

module.exports = Client;