/**
 *@NApiVersion 2.x
 *@NScriptType ScheduledScript
 *@NModuleScope Public
 *@NAmdConfig ./LibraryConfig.json
 */
define(['N/record', 'N/https', 'N/xml', 'N/log', 'N/search', 'N/format', 'N/runtime', 'N/email', 'N/file', 'Crypto', 'lodash', 'moment', 'N/task'],
    function (record, https, xml, log, search, format, runtime, email, file, CryptoJS, _, moment, task) {

        //Notification recipients
        var recipients = ['vishism21@gmail.com', 'systems@latestbuy.com.au'];

        var prefix = 'VR-';

        function execute(context) {

            var lastProcessedID = null;

            try {
                //var daysParameter = runtime.getCurrentScript().getParameter("custscript_mws_seller_id");
                var parameters = {};
                parameters.FeedURL = runtime.getCurrentScript().getParameter("custscript_feed_url");
                parameters.FeedType = runtime.getCurrentScript().getParameter("custscript_feed_type");
                parameters.StockColumn = runtime.getCurrentScript().getParameter("custscript_stock_column");
                parameters.PriceColumn = runtime.getCurrentScript().getParameter("custscript_price_column");
                parameters.APIUsername = runtime.getCurrentScript().getParameter("custscript_api_username");
                parameters.APIPassword = runtime.getCurrentScript().getParameter("custscript_api_password");
                parameters.LastProccessedID = runtime.getCurrentScript().getParameter("custscript_vr_last_processed_id");
                parameters.timeOffset = 8;
                parameters.since = runtime.getCurrentScript().getParameter("custscript_vr_update_since");

                if(parameters.LastProccessedID != '' && parameters.LastProccessedID != null) {
                    lastProcessedID = parameters.LastProccessedID;
                    log.debug("lastProcessedID", lastProcessedID);
                }

                log.debug("Status", "Calling API");

                var content = callAPI(parameters);

                log.debug("Status", "API Response Received");

                var products = processResponse(content);

                log.debug("Status", "Starting Product Update");

                //Update products
                updateProducts(products, lastProcessedID, parameters);

                log.debug("Status", "Completed Product Update");

            } catch (e) {
                log.error({ "title": "error", 'details': e });

                //Send Email
                sendEmail("VR Inventory Update Script Error", "Error: " + e);
            }
        }

        function processResponse(xmlResponse) {

            var productNode = xml.XPath.select({
                node: xmlResponse,
                xpath: '//product'
            });

            var products = {};

            var productCount = 0;

            for (var i = 0; i < productNode.length; i++) {

                //Get the product id
                var id = productNode[i].getAttributeNode({
                    name: 'id'
                }).value;

                //Get the product name
                var title = productNode[i].getAttributeNode({
                    name: 'title'
                }).value;

                //Get the price
                var price = productNode[i].getAttributeNode({
                    name: 'price'
                }).value;

                //Get the Product Stock
                var stock = productNode[i].getAttributeNode({
                    name: 'stock'
                }).value;

                //Set max stock, anything > 30, set stock at 30
                if(!isNaN(stock) && stock > 0) {
                    stock = calculateStockBuffer(price, stock);
                }

                //Get the Product Shipment Due Date
                var shipment_due = productNode[i].getAttributeNode({
                    name: 'shipment_due'
                }).value;

                //Set the products
                products[prefix+id] = { "ExternalID": prefix+id, "name": title, "price": price, "stock": stock, "shipment_due": shipment_due };
                // products[id]["name"] = title;
                // products[id]["price"] = price;
                // products[id]["stock"] = stock;

                //log.error("Product Details:" , "ID: " + id + ", Title: " + title + ", Price: " + price + ", Stock: " + stock);

                productCount++;

            }

            log.error("Product Count", productCount);

            return products;
        }

        function updateProducts(items, lastProcessedID, params) {

            //var itemExtIds = [];
            var itemData = [];

            _.forEach(items, function (item) {
                //itemExtIds.push(item.ExternalID);
                itemData[item.ExternalID] = item;
            });

            //log.debug('itemData', itemData);

            //All external ids
            var externalIDS = Object.keys(itemData).map(function (k) { return '' + itemData[k].ExternalID });

            if (externalIDS.length > 0) {

                //Search for product
                var columns = [];
                columns.push(search.createColumn({ name: "internalid" , sort: search.Sort.ASC}));
                columns.push(search.createColumn({ name: "externalid" }));
                columns.push(search.createColumn({ name: "displayname" }));

                var filters = new Array();

                if (parseInt(params.since) > 0) {
                    filters.push(search.createFilter({
                        name: 'externalid',
                        operator: search.Operator.ANYOF,
                        values: externalIDS
                    }));
                }

                if(lastProcessedID) {
                    filters.push(search.createFilter({
                        name: 'formulanumeric',
                        operator: search.Operator.GREATERTHAN,
                        values: lastProcessedID,
                        formula: '{internalid}'
                    }));
                }

                filters.push(search.createFilter({
                    name: 'vendor',
                    operator: search.Operator.ANYOF,
                    values: '1728927'
                }));

                //Only VR Distribution Items
                filters.push(search.createFilter({
                    name: 'custitem_vr_product',
                    operator: search.Operator.IS,
                    values: 'T'
                }));

                var inventoryitemSearch = search.create({
                    type: search.Type.INVENTORY_ITEM, //Change the type as per your requirement
                    filters: filters,
                    columns: columns
                });

                var itemcount = 0;
                var lastCompletedInternalID = null;

                var pagedData = inventoryitemSearch.runPaged({pa​g​e​S​i​z​e : 1000});

                var endLoop = false;

                // iterate the pages
                for( var i=0; i < pagedData.pageRanges.length; i++ ) {

                    // fetch the current page data
                    var currentPage = pagedData.fetch(i);

                    for( var v = 0; v < currentPage.data.length; v++ ) {

                        var result = currentPage.data[v];

                        //Check Usage
                        if (runtime.getCurrentScript().getRemainingUsage() < 400 && lastCompletedInternalID) {
                            log.debug("Status", 'Rescheduling script with last processed id: ' + lastCompletedInternalID);
                            rescheduleCurrentScript(lastCompletedInternalID);
                            endLoop = true;
                            break;
                        }

                        //Get product data
                        var internalid = result.getValue({ name: 'internalid' });
                        var externalid = result.getValue({ name: 'externalid' });
                        var displayname = result.getValue({ name: 'displayname' });

                        //Stock
                        var stock = 0;

                        //Shipment
                        var shipment_due = '';

                        //Check if required fields are set before updating.
                        if (typeof (itemData[externalid]) !== "undefined") {

                            //log.error("PRODUCT FOUND IN API RESPONSE");

                            //Set the shipment due from API
                            if (itemData[externalid].shipment_due != '') {
                                shipment_due = convertDate(itemData[externalid].shipment_due);
                            }

                            //Set the stock from API
                            if(itemData[externalid].stock != '') {
                                stock = itemData[externalid].stock;
                            }
                        }

                        var submitFieldsPromise = record.submitFields({
                            type: record.Type.INVENTORY_ITEM,
                            id: internalid,
                            values: {
                                custitem_vr_stock: stock,
                                custitem11: shipment_due
                            },
                            options: {
                                enableSourcing: false,
                                ignoreMandatoryFields: true
                            }
                        });

                        //log.error("Item Data:", itemData[externalid]);
                        //log.error("Product Update Status", internalid + ' > ' + displayname + " Product Updated!");

                        lastCompletedInternalID = internalid;

                        itemcount++;
                    }

                    if(endLoop) {
                        break;
                    }
                }

                log.debug("Items Updated", itemcount);
            }
        }

        function callAPI(params) {
            var time = moment().add(params.timeOffset, 'hours').format("YYYY-MM-DDTHH:mm:ss");
            var method = "POST";
            var protocol = "https";
            var now = moment();

            //Set the request headers
            var headers = {
                "Content-Type": "application/x-www-form-urlencoded"
            };

            var parameters = {
                "user": params.APIUsername,
                "pass": params.APIPassword,
                "full": true,
            };

            if (parseInt(params.since) > 0) {

                //get the time component
                var dt = new Date();
                log.error("Current time", moment(dt).format('YYYY-MM-DD H:mm:ss'));
                dt.setHours( dt.getHours() - params.since );

                //Set the parameter
                var since = moment(dt).format('YYYY-MM-DD H:mm:ss');
                parameters.since = since
                delete parameters.full;
            }

            log.error('parameters', parameters);

            var url = params.FeedURL;

            var response = https.post({
                url: url,
                body: parameters,
                headers: headers
            });

            if (response.code == '200') {

                var responseBody = response.body;

                //log.error("responseBody", responseBody);

                var xmlResponse = xml.Parser.fromString({
                    text: responseBody
                });

                return xmlResponse;
            }
            else {
                log.error(response.code, response.body);

                //Send Email
                sendEmail("VR Inventory Update API response", "Error: " + response.code + " " + response.body);
            }
        }

        function getContent(params) {

            //var searchId = 'customsearch986';
            var searchId = params.savedSearch;

            if (!searchId)
                return { "ERROR": "No search id found" };
            var content = '';
            var searchObj = search.load({
                id: searchId
            });
            var resultsArray = new Array();
            var columns = searchObj.columns;
            var label = null;
            var count = 0;
            var pagedSearch = searchObj.runPaged({ pageSize: 1000 });
            var pagedSearchCount = pagedSearch.pageRanges;
            var pageLength = pagedSearchCount.length;
            var blankColumns = ["product-id", "product-id-type", "price", "item-condition", "expedited-shipping", "standard-plus", "item-note", "fulfillment-center-id", "product-tax-code", "merchant_shipping_group_name", "quantity-price-type", "quantity-lower-bound1", "quantity-price1", "quantity-lower-bound2", "quantity-price2", "quantity-lower-bound3", "quantity-price3"]
            var content = '';
            var lastId = '';
            for (var i = 0; i < columns.length; i++) {
                content += columns[i]['label'];
                if (i == columns.length - 1) {
                    content += '\n';
                }
                else {
                    content += '\t';
                }
            }
            for (var x = 0; x < pageLength; x++) {
                //for(var x=0; x<1; x++){
                var pagedSearchData = pagedSearch.fetch({ index: x }).data;
                pagedSearchData.forEach(function (result) {
                    if (result.id == lastId)
                        return true;
                    resultsArray.push({ id: result.id });
                    var row = '';
                    for (var i = 0; i < columns.length; i++) {
                        label = columns[i]['label'];
                        if (_.indexOf(blankColumns, label) > -1) {
                            if (label != 'quantity-price3') {
                                row += '\t';
                            }
                        }
                        else {
                            if (label == 'will-ship-internationally') {
                                if (result.getValue(columns[i]) != "y") {
                                    row += '\t';
                                }
                                else {
                                    row += result.getValue(columns[i]) + '\t';
                                }
                            }
                            else {
                                row += result.getValue(columns[i]) + '\t';
                            }
                        }
                    }
                    lastId = result.id;
                    row += '\n';

                    content += row;
                    count++;
                    return true;
                });
            }
            log.error('resultsArray', resultsArray.length);
            return content;
        }

        function convertDate(dateString) {
            var p = dateString.split(/\D/g)
            return [p[2], p[1], p[0]].join("/")
        }

        function rescheduleCurrentScript(value) {

            var scheduledScriptTask = task.create({
                taskType: task.TaskType.SCHEDULED_SCRIPT
            });

            scheduledScriptTask.scriptId = runtime.getCurrentScript().id;
            scheduledScriptTask.deploymentId = runtime.getCurrentScript().deploymentId;
            scheduledScriptTask.params = {
                'custscript_vr_last_processed_id': value,
            };

            return scheduledScriptTask.submit();
        }

        function calculateStockBuffer(price, stock) {

            if(!isNaN(stock) && parseFloat(price) > 0) {

                //Anything > 40, set as 40 (so max. stock on any product is 40 less the buffer)
                if (stock > 40) {
                    stock = 40;
                }

                //Apply buffer
                if(parseFloat(price) > 100) { //RRP >$200, then buffer is 1
                    stock = parseInt(stock) - 1;
                }
                else if(parseFloat(price) > 25) { //RRP >$50, then buffer is 5, unless
                    stock = parseInt(stock) - 5;
                }
                else { //Standard buffer is 20 across all lines
                    stock = parseInt(stock) - 10;
                }

                //Make sure negative values are set to 0
                stock = Math.max(0, stock);
            }

            return stock;
        }

        function sendEmail(subject, content) {
            var options = {};
            options.author = -5;
            options.recipients = recipients;
            options.subject = subject;
            options.body = content +
                "\n\n";
            email.send(options);
        }

        return {
            execute: execute
        };
    });
