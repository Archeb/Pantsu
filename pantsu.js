class Pantsu {
	/**
	 * 创建新的胖次对象
	 * @param {String} id 你将要注册的PeerID
	 * @param {String} publicKey 你的RSA公钥
	 * @param {String} privateKey 你的RSA私钥
	 * @param {String} nickName 你的昵称
	 * @param {Array} chats 加入的群列表
	 * @param {Array} friends 浮莲子(大误)
	 * @param {Boolean} debugMode 开启后将会在控制台输出所有发送和收到的数据，默认为False
	 * @param {String} identity 定义你的唯一Identity，如不指定默认使用PeerID
	 */
	constructor(id, publicKey, privateKey, nickName, chats = [], friends = [], debugMode = false, identity = null) {
		//初始化变量
		this.peer = new Peer(id);
		this.identity = identity ? identity : id;
		this.friends = friends;
		this.chats = chats;
		this.debugMode = debugMode; //会打印所有发送的信息
		this.nickName = nickName;
		//配置加密
		this.myPublicKey = publicKey;
		this.myPrivateKey = privateKey;
		//绑定this对象等
		this.handleOpen = this.handleOpen;
		this.handleConnection = this.handleConnection.bind(this);
		//注册事件
		this.peer.on('open', this.handleOpen);
		this.peer.on('connection', this.handleConnection);
	}

	//处理连接事件
	handleConnection(conn) {
		const self = this;
		conn.on('data', function (data) {
			self.handleData(this, data);
		});
		//发送 Ciallo 包
		conn.on('open', function (data) {
			self.sendCiallo(this);
		});
	}

	//处理数据
	handleData(conn, data) {
		if (this.debugMode) {
			console.log("[RECV FROM " + conn.peer + "] " + JSON.stringify(data));
		}
		//检测数据合法性
		if (!(data && data.Source == conn.peer && data.Target == this.peer.id && data.Identity)) {
			//错误
			this.handleError('数据包来源不合法');
			conn.close();
			return;
		}
		if (data && data.Action) {
			if (conn.Cialloed == false && data.Action != 'Ciallo') {
				//错误
				this.handleError('数据包顺序不合法');
				conn.close();
				return;
			}
			switch (data.Action) {
				case 'Ciallo':
					//处理 Ciallo 包
					this.handleCiallo(conn, data);
					//发送 Neighbour 包
					this.sendNeighbour(conn, data);
					break;
				case 'Neighbour':
					//处理 Neighbour 包
					break;
				case 'Auth':
					this.handleAuth(conn, data);
					break;
				case 'AuthResp':
					this.handleAuthResp(conn, data);
					break;
				case 'Message':
					//进行公钥验证
					break;
				default:
					//错误
					this.handleError('数据包Action不合法');
			}
		} else {
			//错误
			this.handleError('数据包格式不合法');
			conn.close();
			return;
		}
	}

	handleCiallo(conn, data) {
		this.checkAuth(conn, data);
		conn.Cialloed = true;
		pz.peer.connections[conn.peer].chats = [];
		data.Chats.forEach(c => {
			this.chats.forEach(f => {
				if (f.ChatName == c.ChatName && this.AESDecrypt(c.Auth, f.ChatKey) == conn.peer) {
					pz.peer.connections[conn.peer].chats.push(c.ChatName);
				};
			})
		});
	}

	handleAuth(conn, data) {
		//先判断我有没有这个好友
		var findFriend = this.friends.find(f => {
			return (f.Identity == data.Identity)
		});
		if (findFriend) {
			var decrypt = new JSEncrypt();
			decrypt.setPrivateKey(this.myPrivateKey);
			var decrypted = decrypt.decrypt(data.Encrypted);
			if (JSON.parse(decrypted).SSTI == CryptoJS.SHA256(conn.peer + conn.provider.options.host + conn.provider.options.port + conn.provider.options.path + this.peer.id + data.Identity).toString()) {
				conn.LocalAESKey = this.randomWord(false, 64);
				var encrypt = new JSEncrypt();
				encrypt.setPublicKey(findFriend.PublicKey);
				var message = {
					'Action': 'AuthResp',
					'Decrypted': decrypted,
					'AESKey': encrypt.encrypt(conn.LocalAESKey)
				};
				this.send(conn,message)
			} else {
				//错误
				this.handleError('对方SSTI验证失败');
				conn.close();
				return;
			}
		} else {
			//错误
			this.handleError('好友不存在');
			conn.close();
			return;
		}
	}

	handleError(err) {
		console.log('[ERROR]' + err);
	}
	handleAuthResp(conn, data) {
		if(data.Decrypted==conn.THE_DATA){
			var decrypt = new JSEncrypt();
			decrypt.setPrivateKey(this.myPrivateKey);
			conn.Authorized=true;
			conn.ForeignAESKey=decrypt.decrypt(data.AESKey);
			console.log('密钥交换完成！');
		}
	}
	handleOpen(id) {
		//成功创建和peerServer的连线
	}


	cleanDeadConnection() {
		//十秒钟清理一次状态不为open的连接
	}

	checkAuth(conn, data) {
		var findFriend = this.friends.find(f => {
			return (f.Identity == data.Identity)
		});
		if (findFriend) {
			//发送 Auth 请求
			var encrypt = new JSEncrypt();
			encrypt.setPublicKey(findFriend.PublicKey);
			var THE_DATA = JSON.stringify({
				'SSTI': CryptoJS.SHA256(this.peer.id + this.peer.options.host + this.peer.options.port + this.peer.options.path + conn.peer + this.identity).toString(),
				'Random': this.randomWord(false, 16)
			});
			conn.THE_DATA = THE_DATA;
			THE_DATA = encrypt.encrypt(THE_DATA);
			var message = {
				'Action': 'Auth',
				'Encrypted': THE_DATA
			}
			this.send(conn, message);
		}
	}

	//连接别人
	connect(id) {
		var conn = this.peer.connect(id);
		const self = this;
		//处理消息
		conn.on('data', function (data) {
			self.handleData(this, data);
		});
		//发送 Ciallo 包
		conn.on('open', function (data) {
			self.sendCiallo(this);
		});
	}
	//发送消息
	send(conn, message) {
		message.Source = this.peer.id;
		message.SourcePeer = this.peer.options.host + ":" + this.peer.options.port + this.peer.options.path;
		message.Target = conn.peer;
		message.Identity = this.identity;
		if (this.debugMode) {
			console.log("[SEND TO " + conn.peer + "] " + JSON.stringify(message));
		}
		conn.send(message);
	}

	//广播消息
	boardcast(message) {
		var conns;
		for (conns in this.peer.connections) {
			this.peer.connections[conns].forEach(conn => {
				this.send(conn, message);
			})
		}
	}

	//添加Chats
	addChats(chat) {
		this.chats.push(chat);
	}

	//构造并发送 Ciallo
	sendCiallo(conn) {
		var data = {
			'Action': 'Ciallo',
			'MyName': this.nickName,
			'Chats': []
		};
		this.chats.forEach(c => {
			data.Chats.push({
				'ChatName': c.ChatName,
				'Auth': this.AESEncrypt(this.peer.id, c.ChatKey)
			});
		})
		this.send(conn, data);
	}

	//构造并发送 Neighbour
	sendNeighbour(conn, message) {
		if (message.Chats) {
			//验证Auth
			var data = {
				'Action': 'Neighbour',
				'Chats': []
			};
			message.Chats.forEach(c => {
				var tempKeyList = {};
				this.chats.filter(f => {
					if (f.ChatName == c.ChatName && this.AESDecrypt(c.Auth, f.ChatKey) == conn.peer) {
						tempKeyList[f.ChatName] = f.ChatKey;
						return true;
					};
				}).forEach(validated => {
					var Chat = {
						'ChatName': validated.ChatName,
						'Neighbours': []
					};
					var conn;
					for (conn in this.peer.connections) {
						if (this.peer.connections[conn].chats.includes(validated.ChatName)) {
							Chat.Neighbours.push(this.AESEncrypt(conn, tempKeyList[validated.ChatName]));
						}
					}
					data.Chats.push(Chat);
				})
			})
			this.send(conn, data);
		} else {
			//错误
			this.handleError('Ciallo包没有Chat项')
		}
	}

	AESEncrypt(data, key) {
		return CryptoJS.AES.encrypt(data, key, {
			mode: CryptoJS.mode.ECB,
			padding: CryptoJS.pad.Pkcs7
		}).toString();
	}
	AESDecrypt(data, key) {
		return CryptoJS.AES.decrypt(data, key, {
			mode: CryptoJS.mode.ECB,
			padding: CryptoJS.pad.Pkcs7
		}).toString(CryptoJS.enc.Utf8);
	}

	randomWord(randomFlag, min, max) {
		var str = "",
			range = min,
			arr = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'];

		// 随机产生
		if (randomFlag) {
			range = Math.round(Math.random() * (max - min)) + min;
		}
		for (var i = 0; i < range; i++) {
			var pos = Math.round(Math.random() * (arr.length - 1));
			str += arr[pos];
		}
		return str;
	}

}
