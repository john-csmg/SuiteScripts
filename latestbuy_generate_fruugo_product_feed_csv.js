/**
 *@NApiVersion 2.x
 *@NScriptType ScheduledScript
 *@NModuleScope Public
 *@NAmdConfig ./LibraryConfig.json
 */
define(['N/search', 'N/record', 'N/email', 'N/runtime', 'N/file'],
    function(search, record, email, runtime, file) {
		var params = {
            searchId : runtime.getCurrentScript().getParameter("custscript_searchid"),
        };
        function execute(context) {
            try {
            	var searchObj = search.load({
        			id: params.searchId
        		});
            	
            	var csvFile = file.create({
                    name: 'fruugo-v2.csv', 
                    contents: 'ProductId,SkuId,Title,Attribute1,AttributeSize,AttributeColor,EAN,Brand,Category,Imageurl1,Imageurl2,Imageurl3,StockStatus,StockQuantity,LeadTime,Description,NormalPriceWithoutVAT,DiscountPriceWithoutVAT,PackageWeight,VATRate,Language,Currency,Country\n',
                    folder: 1359069, 
                    fileType: 'CSV',
                    isOnline: true
                });
            	
        		var columns = searchObj.columns;
        		var label 	= null;
        		var count 	= 0;
        		var pagedSearch = searchObj.runPaged({pageSize: 1000});
        		var pagedSearchCount = pagedSearch.pageRanges;
        		var pageLength = pagedSearchCount.length;
        		var resultsArray = new Array();
        		for(var x=0; x<pageLength; x++){
        			var pagedSearchData = pagedSearch.fetch({index: x}).data; 
        			pagedSearchData.forEach(function(result){
        				resultsArray.push({id: result.id});
        				for (var i = 0; i < columns.length; i++){
        					label = columns[i]['label'];
        					if (label.indexOf('.text') == -1){
        						resultsArray[count][label] = result.getValue(columns[i]);
        					} else {
        						label = label.replace('.text', '');
        						if (result.getValue(columns[i]) != ''){
        								resultsArray[count][label] = result.getText(columns[i]);
        						} else {
        							resultsArray[count][label] = '';
        						}
        					}
        				}
        				count++;
        				return true;
        			});
        		}		

        		for (var i = 0; i < count; i++) {
        			var ProductId = escapeCSV(resultsArray[i].ProductId);
        			var SkuId = escapeCSV(resultsArray[i].SkuId);
        			var Title = escapeCSV(resultsArray[i].Title);
        			var Attribute1 = escapeCSV(resultsArray[i].Attribute1);
        			var AttributeSize = escapeCSV(resultsArray[i].AttributeSize);
        			var AttributeColor = escapeCSV(resultsArray[i].AttributeColor);
        			var EAN = escapeCSV(resultsArray[i].EAN);
        			var Brand = escapeCSV(resultsArray[i].Brand);
        			var Category = escapeCSV(resultsArray[i].Category);
        			var Imageurl1 = escapeCSV(resultsArray[i].Imageurl1);
        			var Imageurl2 = escapeCSV(resultsArray[i].Imageurl2);
        			var Imageurl3 = escapeCSV(resultsArray[i].Imageurl3);
        			var StockStatus	= escapeCSV(resultsArray[i].StockStatus);
        			var StockQuantity = escapeCSV(resultsArray[i].StockQuantity);
        			var LeadTime = escapeCSV(resultsArray[i].LeadTime);
        			var Description = '';
        			if(resultsArray[i].Description)
        				Description	= escapeCSV(removeSmartQuotes(safeString(removeLBOnlyContent(resultsArray[i].Description))));
        			
        			var NormalPriceWithoutVAT = escapeCSV(resultsArray[i].NormalPriceWithoutVAT);
        			var DiscountPriceWithoutVAT	= escapeCSV(resultsArray[i].DiscountPriceWithoutVAT);
        			var PackageWeight = escapeCSV(resultsArray[i].PackageWeight);
        			var VATRate	= escapeCSV(resultsArray[i].VATRate);
        			var Language = escapeCSV(resultsArray[i].Language);
        			var Currency = escapeCSV(resultsArray[i].Currency);
        			var Country = escapeCSV(resultsArray[i].Country);
        			
        			var newLine = ProductId + '\,' + SkuId + '\,' + Title +'\,' + Attribute1 +'\,' + AttributeSize +'\,' + AttributeColor +'\,'
                    + EAN +'\,' + Brand +'\,' + Category +'\,' + Imageurl1 +'\,' + Imageurl2 +'\,' + Imageurl3 +'\,' + StockStatus +'\,' + StockQuantity +'\,' + LeadTime +'\,'
                    + Description +'\,' + NormalPriceWithoutVAT +'\,' + DiscountPriceWithoutVAT +'\,'+PackageWeight+'\,' + VATRate +'\,' + Language+'\,' + Currency+'\,' + Country;
        			csvFile.appendLine({
                        value: newLine
                    });
                }
        		var csvFileId = csvFile.save();
                log.error('csvFileId', csvFileId);
        		return resultsArray;
            } catch (e) {
            	// Error
            	log.error('e', e);
            }
        }
        return {
            execute: execute
        };
    });

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

function safeString(text)
{	
	var cleanText = text;
	
	cleanText = cleanText.replace(new RegExp( "\\n", "g" )," ");
	cleanText = cleanText.replace(new RegExp( "\\r", "g" )," ");
	cleanText = cleanText.replace(new RegExp( "\\t", "g" ),"");
	
	return cleanText;
}

function removeLBOnlyContent(text)
{
	var cleanText = text;
	
	cleanText = cleanText.replace(new RegExp( "(\<\!\-\- LBOnlyStart \-\-\>)(.*)(\<\!\-\- LBOnlyEnd \-\-\>)", "g" ),"");
	
	return cleanText;
}