var net = require('net');
var fs = require('fs');
var http = require('http');
var SERVER_SAVE_DIRECTORY_LOCAL = "/home/gmturbo/tmp/";
var SERVER_SAVE_DIRECTORY_REMOTE = "/home/unbuntu/tmp/";

var sockets = [];
var users = []; 

function chr (codePt) {
  // http://kevin.vanzonneveld.net
  // +   original by: Kevin van Zonneveld (http://kevin.vanzonneveld.net)
  // +   improved by: Brett Zamir (http://brett-zamir.me)
  // *     example 1: chr(75);
  // *     returns 1: 'K'
  // *     example 1: chr(65536) === '\uD800\uDC00';
  // *     returns 1: true
  if (codePt > 0xFFFF) { // Create a four-byte string (length 2) since this code point is high
    //   enough for the UTF-16 encoding (JavaScript internal use), to
    //   require representation with two surrogates (reserved non-characters
    //   used for building other characters; the first is "high" and the next "low")
    codePt -= 0x10000;
    return String.fromCharCode(0xD800 + (codePt >> 10), 0xDC00 + (codePt & 0x3FF));
  }
  return String.fromCharCode(codePt);
}

var runShell = function(command){

  var sys = require('sys'),
			exec = require('child_process').exec;
	
	function puts(error, stdout, stderr) { 
		sys.puts(stdout); 
	}
	
	exec(command, puts);
}
/*
 * Cleans the input of carriage return, newline
 */
function cleanInput(data) {
	return data.toString().replace(/(\r\n|\n|\r)/gm,"");
}
 
/*
 * Method executed when data is received from a socket
 */
function receiveData(socket, data) {
	var cleanData = cleanInput(data);
	if(cleanData.length == 0 )
		return;
	if(cleanData === "-quit") {
		socket.end('Goodbye!\n');
	}
	else if(!runCommand(socket, cleanData)){
		var ind = sockets.indexOf(socket);
		console.log(users[ind] + ": " + cleanData);
		for(var i = 0; i<sockets.length; i++) {
			if (sockets[i] !== socket && sockets[i].writable) {
				sockets[i].write("\r" + users[ind] + ": " + cleanData + "\n");
			}
		}
	}
}

function sendFile(socketSender, socketReceiver, data){
	
	if(socketReceiver === undefined){
		socketSender.write("\n*error finding user :(");
		return;	
	}
	var filename = data.split('/').splice(-1);
	var ReadStream = fs.createReadStream(data);
	var WriteStream = fs.createWriteStream(SERVER_SAVE_DIRECTORY + filename);
	
	
	ReadStream.on('error', function(err){
        	console.log(err);
    	});

	ReadStream.on('open',function() {
		ReadStream.pipe(WriteStream);
	});

	WriteStream.on('error', function(err){
        	console.log(err);
    	});
	
	WriteStream.on('end', function(){
			
	});
}

function receiveFile(receiverSocket, data){
	
}

function emitData(data) {
	console.log("*" + data);
	for(var i = 0; i<sockets.length; i++) {
		if(sockets[i].writable)
			sockets[i].write("\n*" + data + '\n');
	}
}

function getIndex(socket){  return sockets.indexOf(socket); }

function getUserIndex(user) { return users.indexOf(user); } 

function runCommand(socket, data){

	var isCommand = false;
	var splt = data.split(' ');
	
	switch(splt[0]){
		case '-name':
		
		if( splt.length == 2){
			var swapIndex = getIndex(socket);
			var oldName = users[swapIndex];
			users[swapIndex] = splt[1];
			emitData(oldName + " changed name to " + splt[1]);
		}else{
			socket.write("*formatting error: -name newName\n");		
		}
		isCommand = true;
		break;

		case '-help':
		socket.write('*Available Commands:\n*-myname\n*-name newname\n\*-users\n*-quit\n');
		isCommand = true;
		break;

		case '-users':
		socket.write("*" + users.join('\n*') + '\n');
		isCommand = true;
		break;

		case '-myname':
		socket.write("*" + users[getIndex(socket)] + "\n");
		isCommand = true;
		break;

		case '-send': //-send user file
		//socket.write("*sending " + splt[2] + " to " + splt[1] + "...");
		//sendFile(socket, sockets[getUserIndex(splt[1])], splt[2]); 
		isCommand = true;
		break;

	}

	return isCommand;
}
 
/*
 * Method executed when a socket ends
 */
function closeSocket(socket) {

	var i = getIndex(socket);
	
	if (i != -1) {
		var oldName = users[i];
		emitData(oldName + " has left :(");
		sockets.splice(i, 1);
		users.splice(i, 1);
	}
}

/*
 * Callback method executed when a new TCP socket is opened.
 */
function newSocket(socket) {
	socket.setEncoding('utf-8');
	sockets.push(socket);
	//socket.write(chr(0xff) + chr(0xfb) + chr(0x01) + chr(0xff) + chr(0xfb) + chr(0x03) + chr(0xff) + chr(0xfd) + chr(0x0f3))
	socket.write('\nWelcome to Chisme');
	socket.write("\nenter name: \n");
	var named = false;
	socket.on('data', function(data) {
		if(!named){
			users[getIndex(socket)] = cleanInput(data);
			emitData(users[getIndex(socket)] + " joined the chat :)");
			named = true;
			runCommand(socket, "-help");
		}else{
			receiveData(socket, data);
		}
	})

	//socket.on('receiveFile', receiveFile); //setup file transfer stuff

	socket.on('end', function() {
		closeSocket(socket);
	})
}
 
// Create a new server and provide a callback for when a connection occurs
var server = net.createServer(newSocket);

http.createServer(function(request, response){
	var splt = request.url.split('/');
	
	var saveFile = fs.createWriteStream(SERVER_SAVE_DIRECTORY_REMOTE + splt[splt.length-1]);
	var fileBytes = request.headers['content-length'];	
	var uploadedBytes = 0;

	request.pipe(saveFile);

	request.on('data', function(chunk){
		uploadedBytes += chunk.length;
		var progress = (uploadedBytes / fileBytes) * 100;
		var line = "progress: " + parseInt(progress, 10) + "\n";
		response.write(line);
		console.log(line);
	});
	request.on('error', function(){
		console.log("error uploading :(");
		response.end("error uploading :(");
		
	});
	request.on('end', function(){
		console.log("upload finished\n");
		response.end("upload finished\n");
	});

}).listen(8000, '127.0.0.1');

runShell('figlet Chisme TCP Chat Server');
runShell('echo running server at $(curl -s http://ipwhats.appspot.com/) on port 48');
console.log("server started...");
// Listen on port 8888
server.listen(48, '0.0.0.0');
console.log("server listening on port 48");
