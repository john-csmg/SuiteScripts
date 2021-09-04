/**
 *@NApiVersion 2.1
 *@NScriptType ScheduledScript
 *@NModuleScope Public
 *@NAmdConfig ./LibraryConfig.json
 */
define(['N/record', 'N/https', 'N/xml', 'N/log', 'N/search', 'N/format', 'N/runtime', 'N/email', 'N/file', 'Crypto', 'lodash', 'moment', 'N/task'],
    function (record, https, xml, log, search, format, runtime, email, file, CryptoJS, _, moment, task) {
        function updateProductStocks() {
            const internalId = getInternalId();

            if (internalId !== '') {
                const csvData = getCsvData(internalId);
                const externalIDs = getExternalIDs(csvData);

                if (externalIDs?.length > 0) {
                    const inventoryItemSearch = getInventoryItemSearch(externalIDs);
                    const pagedData = inventoryItemSearch.runPaged({
                        pageSize: 1000
                    });
                    let itemcount = 0;
                    let lastCompletedInternalID = null;
                    let endLoop = false;

                    for (let i = 0; i < pagedData.pageRanges.length; i++) {
                        // fetch the current page data
                        const currentPage = pagedData.fetch(i);

                        for (let v = 0; v < currentPage.data.length; v++) {
                            const result = currentPage.data[v];

                            //For governance purposes
                            checkUsage(lastCompletedInternalID, endLoop);

                            if (endLoop) {
                                break;
                            }

                            submitStockUpdate(result, csvData);
                            lastCompletedInternalID = internalid;
                            itemcount++;
                        }

                        if (endLoop) {
                            break;
                        }
                    }

                    log.debug("Items Updated", itemcount);
                }
            } else {
                logAudit('Internal ID is empty');
            }
        }

        function submitStockUpdate(result, csvData) {
            logAudit('Execute submitStockUpdate function');

            const internalid = result.getValue({ name: 'internalid' });
            const externalid = result.getValue({ name: 'externalid' });
            const displayname = result.getValue({ name: 'displayname' });
            const stock = getStock(csvData, externalid, displayname);

            let debug = {};
            debug['Internal ID'] = internalid;
            debug['External ID'] = externalid;
            debug['Product'] = displayname;
            debug['Stock'] = stock;
            logDebug('Product Data', debug);

            // record.submitFields({
            //     type: record.Type.INVENTORY_ITEM, // Kindly change if record type is wrong
            //     id: internalid,
            //     values: {
            //         custitem_hbjb_stock: stock
            //     },
            //     options: {
            //         enablesourcing: false,
            //         ignoreMandatoryFields: true
            //     }
            // });
        }

        function checkUsage(lastCompletedInternalID, endLoop) {
            if (runtime.getCurrentScript().getRemainingUsage() < 400 && lastCompletedInternalID) {
                logAudit('Status', `Rescheduling script. Last processed id: ${lastCompletedInternalID}`);

                rescheduleCurrentScript(lastCompletedInternalID);
                endLoop = true;
            }
        }

        function getInventoryItemSearch(externalIDs) {
            logAudit('Execute getInventoryItemSearch function');

            const lastProccessedID = runtime.getCurrentScript().getParameter('custscript_hbjb_last_processed_ids'); // Request to vish
            let inventoryItemSearch;
            let columns = [];
            let filters = [];

            columns.push(search.createColumn({ name: 'internalid', sort: search.Sort.ASC }));
            columns.push(search.createColumn({ name: 'externalid' }));
            columns.push(search.createColumn({ name: 'displayname' }));

            filters.push(search.createFilter({
                name: 'externalid',
                operator: search.Operator.ANYOF,
                values: externalIDs
            }));

            if (lastProccessedID) {
                filters.push(search.createFilter({
                    name: 'formulanumeric',
                    operator: search.Operator.GREATERTHAN,
                    values: lastProccessedID,
                    formula: '{internalid}'
                }));
            }

            filters.push(search.createFilter({
                name: 'vendor',
                operator: search.Operator.ANYOF,
                values: '2229' // Request to vish
            }));

            inventoryItemSearch = search.create({
                type: search.Type.INVENTORY_ITEM,
                filters,
                columns
            });

            return inventoryItemSearch;
        }

        function getCsvData(internalId) {
            logAudit('Execute getCsvData function');

            const csvFile = file.load({
                id: internalId
            });
            let nameIndex;
            let qtyIndex;
            let skuIndex;
            let csvData = [];
            let lookupData = [];

            // loadLookupData(lookupData); // Preparation for the lookup file
            csvFile.lines.iterator().each(line => {
                const row = line.value.split(',');

                if (typeof qtyIndex !== 'undefined' && typeof skuIndex !== 'undefined') {
                    const nameValue = row[nameIndex];
                    const stockValue = row[qtyIndex];
                    const skuCodeValue = row[skuIndex];

                    processData(csvData, lookupData, nameValue, stockValue, skuCodeValue);
                }

                // Get the index of the column header
                if (_.indexOf(row, 'SKU code') > 0 && _.indexOf(row, 'Current Stock') > 0) {
                    nameIndex = _.indexOf(row, 'Item Name');
                    qtyIndex = _.indexOf(row, 'Current Stock');
                    skuIndex = _.indexOf(row, 'SKU code');

                    return false;
                }
            });

            return csvData;
        }

        function processData(csvData, lookupData, nameValue, stockValue, skuCodeValue) {
            logAudit('Execute processData function', `External ID: ${skuCodeValue}`);

            if (lookupData?.length > 0) {
                const hasMatch = lookupData.some(skuCode => {
                    return skuCodeValue === skuCode;
                });

                setStock(csvData, nameValue, stockValue, skuCodeValue, hasMatch);
            } else {
                setStock(csvData, nameValue, stockValue, skuCodeValue);
            }

            return true;
        }

        function setStock(csvData, nameValue, stockValue, skuCodeValue, hasMatch = false) {
            logAudit('Execute setStock function', `External ID: ${skuCodeValue}`);

            if (hasMatch || _.parseInt(stockValue) < 5) {
                csvData.push({
                    Name: nameValue,
                    Stock: 0,
                    ExternalID: skuCodeValue
                });
            } else if (_.parseInt(stockValue) > 30) {
                csvData.push({
                    Name: nameValue,
                    Stock: 30,
                    ExternalID: skuCodeValue
                });
            } else {
                csvData.push({
                    Name: nameValue,
                    Stock: stockValue,
                    ExternalID: skuCodeValue
                });
            }
        }

        function loadLookupData(lookupData) {
            logAudit('Execute loadLookupData function');

            // XLSX File
            const lookupFileContents = file.load({
                id: 'HBJB_Lookup.xlsx'
            }).getContents();
            const lines = lookupFileContents.split('\n');

            for (let i = 1; i < lines.length; i++) {
                const value = lines[i].split(' '); // Wild guess with the split(' '). I don't know yet how to split a xlsx
                lookupData.push(value[0]);
            }

            // CSV File
            // const lookupFile = file.load({
            //     id: 'HBJB_Lookup.csv'
            // });
            // const iterator = lookupFile.lines.iterator();

            // // Skip the first row (the header row)
            // iterator.each(function () {
            //     return false;
            // });

            // // Process the rest of the rows
            // iterator.each(line => {
            //     const row = line.value.split(',');

            //     lookupData.push(row[0]);
            //     return true;
            // });
        }

        function getInternalId() {
            logAudit('Execute getInternalId function');

            const resultSet = search.load({
                id: 1486 // Search ID of the saved search
            }).run();
            const results = resultSet.getRange({ start: 0, end: 200 });
            const csvFileName = 'Report for latestbuy.csv';
            const dateToday = moment().add(13, 'hours').format('DD/MM/YYYY');
            let internalId = '';

            for (const result of results) {
                const searchFile = result.getValue({ name: 'name' });
                const dateCreated = getDateCreated(result.getValue({ name: 'datecreated' }));

                if (csvFileName === searchFile && dateToday === dateCreated) {
                    internalId = result.getValue({ name: 'internalid' });
                    break;
                }
            }

            return internalId;
        }

        function getDateCreated(dateCreated) {
            logAudit('Execute getDateCreated function');

            const splittedDateCreated = dateCreated.split(" "); // 17/6/2021 4:43 AM
            return moment(splittedDateCreated[0], "DD-MM-YYYY").format('DD/MM/YYYY'); // "17/06/2021"
        }

        function logAudit(title, details = '') {
            log.audit({
                title,
                details
            });
        }

        function logDebug(title, details = '') {
            log.debug({
                title,
                details
            });
        }

        function rescheduleCurrentScript(lastCompletedInternalID) {
            const scheduledScriptTask = task.create({
                taskType: task.TaskType.SCHEDULED_SCRIPT
            });

            scheduledScriptTask.scriptId = runtime.getCurrentScript().id;
            scheduledScriptTask.deploymentId = runtime.getCurrentScript().deploymentId;
            scheduledScriptTask.params = {
                'custscript_hbjb_last_processed_ids': lastCompletedInternalID // Request to vish
            };

            return scheduledScriptTask.submit();
        }

        function getExternalIDs(csvData) {
            return csvData.map(data => data.ExternalID);
        }

        function getStock(csvData, externalid, product) {
            logAudit('Execute getStock function', `External ID: ${externalid}`);

            let stock;

            csvData.forEach((data) => {
                if (externalid === data.ExternalID) {
                    stock = data.Stock;
                }
            });

            if (typeof stock === 'undefined') {
                logAudit('Having problem getting the stock for this product', `Product: ${product}, External ID: ${externalid}`);
            }

            return stock || 0; // If stock is undefined, substitute it with a zero
        }

        function execute(context) {
            updateProductStocks();
        }

        return { execute };
    });

