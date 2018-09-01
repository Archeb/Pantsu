#Pantsu 通讯协议

本协议并不是个可靠的协议，因为 WebRTC 默认基于UDP...

但是是一个安全的协议，基于 RSA 和 AES 加密，使用 CryptoJS 和 JSEncrypt 库

### chats 格式

```
[
	{
		'ChatName':'ChatName1',
		'ChatKey':'预共享密钥',
	}
]
```

### friends 格式

```json
[
	{
		'Identity':'Unique ID(HASH)',
		'PublicKey':'Public Key'
	}
]
```

### 握手

```json
{
	'Action':'Ciallo',
	'Source':'My Peer ID',
	'SourcePeer':'Source Peer Server Host',
	'Target':'Target Peer ID', //防止重放攻击探测
	'Identity':'Unique ID(HASH)',
	'MyName':'CLIENT_NICKNAME',
	'Chats':[
		{
			'ChatName':'ChatName1',
			'Auth':'Auth1' //使用预共享密钥加密
		},
		{
			'ChatName':'ChatName2',
			'Auth':'Auth2' //使用预共享密钥加密
		}
	]
}
```

### 邻居发现	

收到 Ciallo 包后应当鉴权（解密），鉴权成功后返回已经连接上的其他客户端的PeerID ，被称为 Neighbour 包

```json
{
	'Action':'Neighbour',
	'Source':'My Peer ID',
	'SourcePeer':'Source Peer Server Host',
	'Target':'Target Peer ID',
	'Identity':'Unique ID(HASH)',
	'Chats':[
		{
			'ChatName':'ChatName1',
			'Neighbours':['Peer1','Peer2','Peer3'] //使用预共享密钥加密
		},
		{
			'ChatName':'ChatName2',
			'Neighbours':['Peer1','Peer2','Peer3'] //使用预共享密钥加密
		},
		{
			'ChatName':'ChatName3',
			'Neighbours':['Peer1','Peer2','Peer3'] //使用预共享密钥加密
		}
	]
}
```

### 群聊消息

发送信息，在群聊中你需要把这条消息广播给所有同群的人

之所以有TTL是为了解决部分客户端无法连接到所有人而设计的中继方案

```json
{
	'Action':'GroupMessage',
	'Source':'My Peer ID',
	'SourcePeer':'Source Peer Server Host',
	'Target':'Target Peer ID',
	'Identity':'Unique ID(HASH)',
	'Timestamp':'TIMESTAMP',
	'ChatName':'ChatName',
	'MyName':'CLIENT_NICKNAME',
	'TTL':5,
	'Content':'ArrayBuffer', //使用预共享密钥加密
	'Hash':'SHA256( Content + SOURCE_PEER_ID + TARGET_PEER_ID + TIMESTAMP)'
}
```

### 私聊

基本照搬SSH密钥登陆那一套流程...

1、要进行私聊，首先必须将对方添加到自己的好友列表里面（我方扫对方提供的二维码），内容包含identity和public key

2、对方和我方连接上（Ciallo包已成功，握手成功），但是此时对方的 Authorized 状态为 False（可以群聊不可私聊）

3、首先判断对方是否在好友列表中，如果在，我方发送Auth请求包，使用public key加密一串 ENCRYPTED_DATA

ENCRYPTED_DATA 结构：

```json
{
	'SSTI':SHA256(this.peer.id + this.peer.options.host + this.peer.options.port + this.peer.options.path + conn.peer + this.identity),
	'Random':'Random Data'
}
```

Auth请求包结构：

```json
{
	'Action':'Auth',
	'Source':'My Peer ID',
	'SourcePeer':'Source Peer Server Host',
	'Target':'Target Peer ID',
	'Identity':'Unique ID(HASH)',
	'Encrypted':'ENCRYPTED_DATA'
}
```

4、对方应当返回一个解密的 AuthResp 包，如果与原来的内容一致，则对方的 Authorized 状态变为 True

对方将用我方 Public Key 加密一个临时的 AESKey 并发送给我方，我方用私钥解密并记录下来

后面的消息将使用该AESKey加密发送给对方

```json
{
	'Action':'AuthResp',
	'Source':'My Peer ID',
	'SourcePeer':'Source Peer Server Host',
	'Target':'Target Peer ID',
	'Identity':'Unique ID(HASH)',
	'Decrypted':'DECRYPTED_DATA',
	'AESKey':'ENCRYPTED_AESKEY'
}
```

6、对方客户端也同时进行这一流程，双方的 Authorized 都为 True 时，则可互通消息，消息用AESKey加密

7、私聊消息格式如下

```json
{
	'Action':'PrivateMessage',
	'Source':'My Peer ID',
	'SourcePeer':'Source Peer Server Host',
	'Target':'Target Peer ID',
	'Identity':'Unique ID(HASH)',
	'Timestamp':'TIMESTAMP',
	'MyName':'CLIENT_NICKNAME',
	'TTL':5,
	'Content':'ArrayBuffer', //使用对方发送的AESKey加密
	'Hash':'SHA256( Content + SOURCE_PEER_ID + TARGET_PEER_ID + TIMESTAMP)'
}