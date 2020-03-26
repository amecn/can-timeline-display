'use strict';

/*
TODO
move user script execution to a web worker in case it hangs, may improve performance when typing?
*/

// remove all child nodes of e
function clearElement(e)
{
	while(e.firstChild)
		e.firstChild.remove();
}

// append <p>str</p> to e with style {color:'color';}
function addText(e, str, color)
{
	var p = document.createElement('P');
	if(color)
		p.style.color = color;
	p.appendChild(document.createTextNode(str));
	e.appendChild(p);
}

// run user script
function reloadUserScript(notUserInput)
{
	// MAGIC_ prefix on local variables to limit posibility of interfering with user script
	clearElement(TLR.userScriptOutput);
	// store changes to make and execute everything if no error, or show error and do nothing
	// add messages
	var MAGIC_messages = [];
	var m = function(a,b,c,d){
		if((typeof a) != 'number')
			throw new Error('non-numeric message id ' + a + ' (' + (typeof a) + ')');
		if(b>c)
			throw new Error('m'+a+': sent before ready');
		if(d < 0)
			throw new Error('m'+a+': negative length');
		MAGIC_messages.push([a,b,c,d]);
	};
	// move axis times
	var MAGIC_offsetAxisTimes = [];
	var moveTimeX = function(t,px){
		MAGIC_offsetAxisTimes.push([t,px,0]);
	};
	var moveTimeY = function(t,px){
		MAGIC_offsetAxisTimes.push([t,0,px]);
	};
	// set messages color
	var MAGIC_setColors = [];
	var color = function(a,b,c,d){
		if((typeof a) != 'number')
			throw new Error('color: non-numeric message id ' + a + ' (' + (typeof a) + ')');
		if(!b || !c || !d)
			throw new Error('color: missing a color parameter for message id ' + a);
		MAGIC_setColors.push([a,b,c,d]);
	};
	// time axis settings
	var MAGIC_timeScale = false;
	var timeScale = function(scale){
		if((typeof scale) != 'number')
			throw new Error('non-numeric time scale ' + scale + ' (' + (typeof scale) + ')');
		if(!scale || scale <= 0)
			throw new Error('nonpositive time scale ' + scale);
		MAGIC_timeScale = scale;
	};
	var MAGIC_timeOffset = false;
	var timeOrigin = function(offset){
		if((typeof offset) != 'number')
			throw new Error('non-numeric time origin ' + offset + ' (' + (typeof offset) + ')');
		MAGIC_timeOffset = offset;
	};
	// run user script
	try {
		eval(TLR.userScriptInput.value);
	} catch(e) {
		console.debug('User script error:');
		TLR.lastUserScriptError = e;
		// e.stack is non-standard
		// testing done on firefox
		if(e.stack)
		{
			console.debug(e);
			var trace = e.stack.split('\n');
			// default to what the exception gives, useful when the script raises a syntax error
			var l = e.lineNumber,
				c = e.columnNumber;
			// find least recent anonymous code in the stack, assume it's user script
			for(var i=trace.length-1;i>=0;i--)
			{
				if(trace[i].length > 0 && trace[i][0] == '@')
				{
					var parts = trace[i].split(':');
					l = parts[parts.length-2];
					c = parts[parts.length-1];
					break;
				}
			}
			addText(TLR.userScriptOutput, 'Error line ' + l + ' at position ' + c + ': ' + e.name + ', ' + e.message, 'red');
		}
		else
		{
			console.error(e);
			addText(TLR.userScriptOutput, 'Error: ' + e.name + ' ' + e.message + ' (see browser console for more information)', 'red');
		}
		return;
	}
	if(!notUserInput)
		saveUserScript();
	// rebuild everything
	reset();
	// time axis settings
	if(MAGIC_timeScale !== false)
		TLR.scaleT = MAGIC_timeScale;
	if(MAGIC_timeOffset !== false)
		TLR.offsetT = MAGIC_timeOffset;
	// build messages
	var messages = MAGIC_messages;
	for(var i=0;i<messages.length;i++)
	{
		var a = messages[i];
		addMessage(a[0],a[1],a[2],a[3]);
	}
	// compute axis times y offsets
	var offsetAxisTimes = MAGIC_offsetAxisTimes;
	var unknownTimes = [];
	for(var i=0;i<offsetAxisTimes.length;i++)
	{
		var a = offsetAxisTimes[i];
		if(!offsetAxisTimeXY(a[0],a[1],a[2]))
			unknownTimes.push(a[0]);
	}
	if(unknownTimes.length > 0)
		addText(TLR.userScriptOutput, unknownTimes.length + ' unknown times have y offsets: ' + unknownTimes.join(', '), 'red');
	// add colors
	var setColors = MAGIC_setColors;
	for(var i=0;i<setColors.length;i++)
	{
		var a = setColors[i];
		addColorRules('.m'+a[0]+' ',a[1],a[2],a[3]);
	}
	addText(TLR.userScriptOutput, messages.length + ' message' + (messages.length==1?'':'s') + ' loaded');
}

function saveUserScript()
{
	window.localStorage.userScript = TLR.userScriptInput.value;
}

function restoreSavedUserScript()
{
	if(window.localStorage.userScript)
	{
		TLR.userScriptInput.value = window.localStorage.userScript;
		reloadUserScript(true);
	}
}

// DOM manipulation: messages
function addMessage(n, tReady, tSent, len)
{
	if(n > TLR.maxMessageNumber)
	{
		TLR.maxMessageNumber = n;
		TLR.messagesContainer.style.height = (n*TLR.messageHeight) + 'px';
		TLR.axisTimesContainer.style.top = (n*TLR.messageHeight) + 'px';
	}
	// message container
	var messageDiv = document.createElement('DIV');
	messageDiv.classList.add('message');
	messageDiv.classList.add('m'+n);
	messageDiv.style.left = ((tSent - TLR.offsetT) * TLR.scaleT) + 'px';
	messageDiv.style.top = (n-1) * TLR.messageHeight;
	messageDiv.style.height = TLR.messageHeight + 'px';
	// message-delay
	var messageDelayDiv = document.createElement('DIV');
	messageDelayDiv.classList.add('message-delay');
	messageDelayDiv.style.right = '0px';
	messageDelayDiv.style.width = ((tSent - tReady) * TLR.scaleT) + 'px';
	messageDiv.appendChild(messageDelayDiv);
	// message-send
	var messageSendDiv = document.createElement('DIV');
	messageSendDiv.classList.add('message-send');
	messageSendDiv.appendChild(document.createTextNode('m'+n+'('+len+')'));
	messageSendDiv.style.width = (len * TLR.scaleT) + 'px';
	messageDiv.appendChild(messageSendDiv);
	TLR.messagesContainer.appendChild(messageDiv);
	// add useful axis times
	addAxisTime(tReady);
	addAxisTime(tSent);
	addAxisTime(tSent+len);
}

// DOM manipulation: times
function addAxisTime(t)
{
	if(TLR.axisTimes.indexOf(t) >= 0)
		return;
	TLR.axisTimes.push(t);
	var div = document.createElement('DIV');
	div.id = 'axis-time-' + t;
	div.classList.add('axis-time');
	div.appendChild(document.createTextNode(t));
	var centerOffset = (t == 0 ? 1 : (t > 0 ? Math.log10(t) : (1 + Math.log10(-t)))) * 8 / 2;
	div.style.left = ((t - TLR.offsetT) * TLR.scaleT - centerOffset) + 'px';
	TLR.axisTimesContainer.appendChild(div);
}

function offsetAxisTimeXY(t, x, y)
{
	var div = document.getElementById('axis-time-' + t);
	if(!div)
		return false;
	div.style.left = ((div.style.left?parseFloat(div.style.left):0) + x) + 'px';
	div.style.top = ((div.style.top?parseFloat(div.style.top):0) + y) + 'px';
	return true;
}

// style manipulation
function addColorRules(prefix, delayColor, sendColor, textColor)
{
	TLR.style.sheet.insertRule(prefix + '.message-delay {background-color:' + delayColor + ';}');
	TLR.style.sheet.insertRule(prefix + '.message-send {background-color:' + sendColor + '; color:' + textColor + ';}');
}

// reset to default state, resets DOM under #container
function reset()
{
	if('TLR' in window)
	{
		// cleanup
		clearElement(TLR.messagesContainer);
		clearElement(TLR.axisTimesContainer);
		TLR.userScriptInput.removeEventListener('input', TLR.inputChangeCallback);
		TLR.style.remove();
	}

	window.TLR = {
		messagesContainer: document.getElementById('messages'),
		axisTimesContainer: document.getElementById('axis-times'),
		userScriptInput: document.getElementById('user-script-input'),
		userScriptOutput: document.getElementById('user-script-output'),
		messageHeight: 20,
		offsetT: 0,
		scaleT: 1,
		maxMessageNumber: -1,
		axisTimes: []
	};

	TLR.inputChangeCallback = function(){reloadUserScript()};
	TLR.userScriptInput.addEventListener('input', TLR.inputChangeCallback);
	var colors = [
		// delay color, send color, text color
		['grey','black','white'],		//default
		['pink', 'red','white'],		//m1
		['lightblue', 'blue','white'],	//m2
		['lightgreen', 'green','white'],//...
	];
	TLR.style = document.createElement('style');
	document.head.appendChild(TLR.style);
	addColorRules('', colors[0][0], colors[0][1], colors[0][2]);
	for(var n=1;n<colors.length;n++)
		addColorRules('.m' + n + ' ', colors[n][0], colors[n][1], colors[n][2]);
}

function bodyLoaded()
{
	reset();
	reloadUserScript(true);
}
