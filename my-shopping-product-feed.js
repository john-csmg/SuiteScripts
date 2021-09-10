//each scheduled script MUST have script parameter called Last Processed Internal ID.
//ID of last proessed internal id is defined in CMWL_Constants.js
var SCRIPT_PARAM_PROC_INTERNALID='custscriptmyshoppingparameter1';
var XML_PARAM_INTERNALID='custscriptmyshoppingparameter2';
var lastProcessedId = '';
var intID = '';
var MAIN_SEARCH_ID ='customsearch_ms_feed_items';
var ctx = nlapiGetContext(); //get execution context from server
var xmlContent = '';
var xmlDeclaration = '<?xml version="1.0" encoding="ISO-8859-1"?>' + '\n';
xmlDeclaration += '<products>' + '\n';
var xmlText = '';

//main function
function processMyShoppingFeed() {
	try {
		
		initScriptParam();
		getXML();
		
		var items = getMainSearch();

		var xml = '';

		if(items && items.length > 0)
		{

			var SKU;
		    var Name;
		    var RRP;
		    var inStock;
		    var Category;
		    var caption;
		    var imageA;
		    var imageB;
		    var imageC;
		    var Manufacturer;
		    var ShippingRate;
		    var onHand;
		    var stockDescription;
		    var parentURL;
		    var urlSKU;
		    var done = 0;
		    var UPC;
		    var urlcomponent;
		    var checkIfParent;

		    
			//begin executing scheduled script
			for (var i=0; i < items.length; i++) {
				
				//Get All Columns
				var columns = items[i].getAllColumns();
	        
				 //Check Stock
		        onHand =   items[i].getValue(columns[9]);
		        
	        	if(!onHand || onHand == '' || onHand == null)
	        	{
	        		onHand = 0;
	        	}
		        
	    		if(onHand>0)
					{inStock = 'Y';}
	    		else
					{inStock = 'N';}
	    		
	    		//Mark Matrix items as in stock
	    		checkIfParent = items[i].getValue(columns[13]);
	    		if(checkIfParent != '1')
				{inStock = 'Y';}
	    		
	    		if(inStock == 'N')
	    		{continue;}
	    		
		        RRP =   items[i].getValue(columns[1]);
		        Name =   items[i].getValue(columns[2]);
		        SKU =   items[i].getValue(columns[3]);
		        shortdescrition = items[i].getValue(columns[4]);
		        urlcomponent = 'https://www.latestbuy.com.au/' + items[i].getValue(columns[5]) + '/?partner=245133524&affid=245133524&amp;utm_source=prodFeed3&amp;utm_medium=xml&amp;utm_campaign=prodFeed_my_shopping&utm_term='+SKU;
		        Category =   items[i].getValue(columns[6]);
		        ImageURL =   'http://www.latestbuy.com.au/' + items[i].getValue(columns[7]);
		        ShippingRate =  items[i].getValue(columns[12]);
		        Manufacturer =  items[i].getValue(columns[8]);
		        onHand =   items[i].getValue(columns[9]);
		        UPC = items[i].getValue(columns[10]);
		        
		        //Set Category if not set
		        if(Category == "")
		        	{
		        		Category = 'Gifts and Gift Baskets';
		        	}
		        
		        //Clean Description
		        shortdescrition = removeSmartQuotes(safeString(removeLBOnlyContent(shortdescrition)));
	
		       	//XML Content					
	    		xml += '<item>' + '\n';
	    		xml += '<price>'+ RRP +'</price>' + '\n';
	    		xml += '<name>'+ '<![CDATA[' + Name + ']]>' + '</name>' + '\n';
	    		xml += '<code>'+ '<![CDATA[' + SKU + ']]>' + '</code>' + '\n';
	    		xml += '<description>'+ '<![CDATA[' + shortdescrition + ']]>' + '</description>' + '\n';
	    		xml += '<product_url>'+ '<![CDATA[' + urlcomponent + ']]>' +'</product_url>' + '\n';
	    		xml += '<category>'+ Category + '</category>' + '\n';
	    		xml += '<image_url>'+ '<![CDATA[' + ImageURL + ']]>' + '</image_url>' + '\n';
	    		xml += '<shipping>'+ ShippingRate +'</shipping>' + '\n';
	    		xml += '<brand>'+ '<![CDATA[' + Manufacturer + ']]>' + '</brand>' + '\n';
	    		xml += '<instock>'+ inStock +'</instock>' + '\n';
	    		xml += '</item>' + '\n';
	    		
	    		
    		
    			//Check Available Units
				if (meterCheckRescheduler(i,items,xmlContent + xml)) {
					done = 0;
					break;
				}
				else
					{
					done = 1;
					}
				
			}
			
			
			//If all products have been retrieved, save file in XML folder
			if(done==1)
				{
				
				xml += '</products>';
				
				var removenull = 'null';
			
				xmlContent += xml;
				xmlContent = xmlContent.replace(new RegExp(removenull, 'g'), '');
				
				//Concatenates Header and Content
				xmlText = xmlDeclaration + xmlContent;

				var filename = 'myshopping-feed.xml';
				var filetype = 'XMLDOC';
				var folderid = '1359069'; //feeds folder

				//Write XML to File
				saveFile(filename,filetype,folderid,xmlText);
			
				}
		}
	} 
	catch (e) {
		nlapiLogExecution('ERROR','Runtime Error',e);
		//Additionally, you may want to send error email to your admins here
	}
}





/**
 * Checks to see if script needs to be rescheduled based on remaining script meter.
 * Scheduled script comes with 10000 points.
 * Make sure you set EXIT_COUNT variable above.
 * @param _curArrayIndex
 * @param _rslt
 * @returns {Boolean}
 */
function meterCheckRescheduler(_curArrayIndex, _rslt, _xml) 
{
	if (ctx.getRemainingUsage() <= 20 && (_curArrayIndex+1) < _rslt.length) 
	{
		var schStatus = nlapiScheduleScript(ctx.getScriptId(), ctx.getDeploymentId(), getParam(_rslt[_curArrayIndex],_xml));
		
		if (schStatus=='QUEUED') 
		{
			return true;
		}
		else 
		{
			return false;
		}
	}
	else if(_curArrayIndex > 990)
	{
		var schStatus = nlapiScheduleScript(ctx.getScriptId(), ctx.getDeploymentId(), getParam(_rslt[_curArrayIndex],_xml));
		
		if (schStatus=='QUEUED') 
		{
			return true;
		}
		else 
		{
			return false;
		}
	}
	else 
	{
		return false;
	}
}

function getParam(_rsltrow,__xml) {
	var param = new Array();
	param[SCRIPT_PARAM_PROC_INTERNALID] = _rsltrow.getValue('internalid');
	param[XML_PARAM_INTERNALID] += __xml;
	//params['custscript1'] = _intID;
	//ADD additional paramter. last processed internal ID is automatically added

	return param;
}

/**
 * Search items
 */
function getMainSearch() {
	//var flt=null;
	var col=null;
	var filter = null;
	
	if (lastProcessedId && !isNaN(parseInt(lastProcessedId))) {
		flt = new Array();
		
		//Working Code Below
		filter = new nlobjSearchFilter('formulanumeric', null, 'lessthan', parseInt(lastProcessedId));
		filter.setFormula('{internalid}');

		//ADD IN ADDITIONAL DYNAMIC FILTER OPTION HERE
	}

	//return nlapiSearchRecord('item',MAIN_SEARCH_ID,flt,null);
	return nlapiSearchRecord('item', MAIN_SEARCH_ID, filter, col);
	//return nlapiSearchRecord('item', MAIN_SEARCH_ID, new nlobjSearchFilter('internalid', null, 'lessthan', lastProcessedId, null));
	;
}


/**
 * sets up script parameter if any.
 */
function initScriptParam() {
	lastProcessedId = ctx.getSetting('SCRIPT',SCRIPT_PARAM_PROC_INTERNALID);
	}

function getXML() {
	xmlContent = ctx.getSetting('SCRIPT',XML_PARAM_INTERNALID);
	}

function removeSpace(text)
{
	var mystring = '';
	mystring = text.replace(/^\s+|\s+$/g,'');
	
	return mystring;
}

function safeString(text)
{	
	var cleanText = text;
	
	cleanText = cleanText.replace(new RegExp( "\\n", "g" )," ");
	cleanText = cleanText.replace(new RegExp( "\\r", "g" )," ");
	cleanText = cleanText.replace(new RegExp( "\\t", "g" ),"");
	
	return cleanText;
}

function removeSmartQuotes(text)
{
	var cleanText = text;
	
    cleanText = cleanText.replace( /\u2018|\u2019|\u201A|\uFFFD/g, "'" );
    cleanText = cleanText.replace( /\u201c|\u201d|\u201e/g, '"' );
    cleanText = cleanText.replace( /\u02C6/g, '^' );
    cleanText = cleanText.replace( /\u2039/g, '<' );
    cleanText = cleanText.replace( /\u203A/g, '>' );
    cleanText = cleanText.replace( /\u2013/g, '-' );
    cleanText = cleanText.replace( /\u2014/g, '--' );
    cleanText = cleanText.replace( /\u2026/g, '...' );
    cleanText = cleanText.replace( /\u00A9/g, '(c)' );
    cleanText = cleanText.replace( /\u00AE/g, '(r)' );
    cleanText = cleanText.replace( /\u2122/g, 'TM' );
    cleanText = cleanText.replace( /\u00BC/g, '1/4' );
    cleanText = cleanText.replace( /\u00BD/g, '1/2' );
    cleanText = cleanText.replace( /\u00BE/g, '3/4' );
    cleanText = cleanText.replace(/[\u02DC|\u00A0]/g, " ");
    
	return cleanText;
}

function removeLBOnlyContent(text)
{
	var cleanText = text;
	
	cleanText = cleanText.replace(new RegExp( "(\<\!\-\- LBOnlyStart \-\-\>)(.*)(\<\!\-\- LBOnlyEnd \-\-\>)", "g" ),"");
	
	return cleanText;
}
