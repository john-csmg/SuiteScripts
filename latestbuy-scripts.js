/**
 * Module Description
 * 
 * Version    Date            Author           Remarks
 * 1.00       29 Jul 2014     vap
 *
 */

function removeLBFromMeta(meta) {

	meta = meta.replace(new RegExp("LatestBuy Australia", "g" ),"").replace(new RegExp("Online Australia", "g" ),"").replace(new RegExp("LatestBuy", "g" ),"").replace(new RegExp("Australia", "g" ),"").replace(new RegExp("|", "g" ),"");
	
	meta = TrimText(meta);
	
	return meta;
}

function escapeCSV(val){
	if(!val) return '';
	if(!(/[",\s]/).test(val)) return val;
	val = val.replace(/"/g, '""');
	return '"'+ val + '"';
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

function saveFile(filename, filetype, folderid, content)
{

	//Create text file
	var file = nlapiCreateFile(filename, filetype, content);
	
	//Set folder to save file in
	file.setFolder(folderid); // internal id of the folder
	
	file.setIsOnline(true);
	
	//write result on the same page
	//response.setContentType(file.getType());
	//response.write(file.getValue()); 

	//Write to text File
	var id = nlapiSubmitFile(file);				

}

function TrimText(str)
{
	str = str.trim();
	
	return str;
}

function getSubCategory(cat)
{
	var category = cat.split('>');
	var spiltCategory = '';
	
	if(category.length > 2)
		{
			//Forced to Pass the Department For Now, Change to 2 if last level category is required
			spiltCategory = category[2];
		}
	else if(category.length > 1)
		{
			spiltCategory = category[1];
		}
	else
		{
			spiltCategory = 'Gifts and Gift Baskets';
		}
	
	return spiltCategory;
}


function getitem(itemId)
{
	try{ 
		itemRecord = nlapiLoadRecord('inventoryitem', itemId);
	} 
	catch(SSS_RECORD_TYPE_MISMATCH)
	{
		try{
			itemRecord = nlapiLoadRecord('noninventoryitem', itemId);
		}
		catch(SSS_RECORD_TYPE_MISMATCH)
		{
			try{ 
				itemRecord = nlapiLoadRecord('descriptionitem', itemId);
			}
			catch(SSS_RECORD_TYPE_MISMATCH)
			{
				try{ 
					itemRecord = nlapiLoadRecord('kititem', itemId);
				}
				catch(SSS_RECORD_TYPE_MISMATCH)
				{
					try{ 
						itemRecord = nlapiLoadRecord('assemblyitem', itemId);
					}
					catch(SSS_RECORD_TYPE_MISMATCH)
					{
						try{
							itemRecord = nlapiLoadRecord('serviceitem', itemId);
						}
						catch(e)
						{
							try{
								itemRecord = nlapiLoadRecord('giftcertificateitem', itemId);
							}
							catch(e){
								return "";
							}
						}
					}
				}
			}
		}
	}
return itemRecord;
}


function getCorrelatedItems(internalID) {
	
	var filter = new nlobjSearchFilter('internalid', null, 'is', internalID);
	
	var columns = new Array();
	columns[0] = new nlobjSearchColumn('internalid');
	columns[1] = new nlobjSearchColumn('correlateditem');

	var searchresults = nlapiSearchRecord( 'item', null, filter, columns);
	
	var id = '';
	
	var correlatedItem = '';
	
	 for ( var i = 0; searchresults != null && i < searchresults.length; i++ )
	   {
	      id += searchresults[i].getId();
	      correlatedItem += searchresults[i].getValue('correlateditem');
	      
	      if(i < searchresults.length-1){
	    	  correlatedItem += ",";
	      }
	   }
	
	return correlatedItem;
}

function saveFileUTF8(filename, filetype, folderid, content)
{

	//Create text file
	var file = nlapiCreateFile(filename, filetype, content);
	file.setEncoding('UTF8');
	
	//Set folder to save file in
	file.setFolder(folderid); // internal id of the folder
	
	//write result on the same page
	//response.setContentType(file.getType());
	//response.write(file.getValue()); 

	//Write to text File
	var id = nlapiSubmitFile(file);				

}

//Fixes &gt; character
function safe_tags(str) {
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') ;
}