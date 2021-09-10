/**
 *@NApiVersion 2.1
 *@NScriptType ScheduledScript
 *@NModuleScope Public
 *@NAmdConfig ./LibraryConfig2.json
 */

define(['N/record', 'N/log', 'N/search', 'N/runtime', 'N/email', 'N/file', 'lodash', 'moment', 'N/task', 'jszip', 'xlsx'],
    function (record, log, search, runtime, email, file, _, moment, task, JSZIP, XLSX) {
        let csvFileNameUsed = '';

        function updateProductStocks() {
            const internalId = getInternalId();

            if (internalId !== '') {
                const csvData = getCsvData(internalId);
                const externalIDs = getExternalIDs(csvData);

                if (externalIDs?.length > 0) {
                    const inventoryItemSearch = getInventoryItemSearch();
                    const pagedData = inventoryItemSearch.runPaged({
                        pageSize: 1000
                    });
                    let itemcount = 0;
                    let lastCompletedInternalID = null;
                    let endLoop = false;

                    for (let i = 0; i < pagedData.pageRanges.length; i++) {
                        // Fetch the current page data
                        const currentPage = pagedData.fetch(i);

                        for (let v = 0; v < currentPage.data.length; v++) {
                            const result = currentPage.data[v];

                            // For governance purposes
                            endLoop = checkUsage(lastCompletedInternalID);

                            if (endLoop) {
                                break;
                            }

                            // Updating of stock
                            submitStockUpdate(result, csvData);

                            // Set the last processed id
                            lastCompletedInternalID = result.getValue({ name: 'internalid' });
                            itemcount++;
                        }

                        if (endLoop) {
                            break;
                        }
                    }

                    logAudit('Item count', itemcount);
                }
            } else {
                // logDebug('File not found!');
                sendEmail('HBJB Stock Update - Stock file not found', `Could not find the stock CSV file. \n CSV File: ${csvFileNameUsed}`);
            }
        }

        function submitStockUpdate(result, csvData) {
            const internalid = result.getValue({ name: 'internalid' });
            const externalid = result.getValue({ name: 'externalid' });
            const displayname = result.getValue({ name: 'displayname' });
            const stock = getStock(csvData, externalid, displayname);

            record.submitFields({
                type: record.Type.INVENTORY_ITEM,
                id: internalid,
                values: {
                    custitem_hbjb_stock: stock
                },
                options: {
                    enablesourcing: false,
                    ignoreMandatoryFields: true
                }
            });
        }

        function checkUsage(lastCompletedInternalID) {
            let endLoop = false;

            if (runtime.getCurrentScript().getRemainingUsage() < 400 && lastCompletedInternalID) {
                logAudit('Status', `Rescheduling script. Last processed id: ${lastCompletedInternalID}`);

                rescheduleCurrentScript(lastCompletedInternalID);
                endLoop = true;
            }

            return endLoop;
        }

        function getInventoryItemSearch() {
            // logAudit('Execute getInventoryItemSearch function');

            const lastProccessedID = runtime.getCurrentScript().getParameter('custscript_hbjb_last_processed_ids');
            const columns = [];
            const filters = [];
            let inventoryItemSearch = null;

            columns.push(search.createColumn({ name: 'internalid', sort: search.Sort.ASC }));
            columns.push(search.createColumn({ name: 'externalid' }));
            columns.push(search.createColumn({ name: 'displayname' }));

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
                values: '2229'
            }));

            inventoryItemSearch = search.create({
                type: search.Type.INVENTORY_ITEM,
                filters,
                columns
            });

            return inventoryItemSearch;
        }

        function getCsvData(internalId) {
            // logAudit('Execute getCsvData function');

            const csvFile = file.load({
                id: internalId
            });
            const csvContent = csvFile.getContents().split('\n');
            const lookUpData = getLookUpData();
            const csvData = [];
            let nameIndex;
            let qtyIndex;
            let stockCodeIndex;

            if (csvContent.length > 5) {
                for (let i = 0; i < csvContent.length; i++) {
                    /*
                     * replace - remove excess quotation mark
                     * replace - remove the carriage or \r
                     * split - splitted into array with special handling
                     * special handling - when text is enclosed in a quotation mark even if it has a comma in it, it is not included in the array split
                    */
                    const rowData = csvContent[i].replace(/"/g, '').replace(/[\r]/g, '').trim().split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);

                    // Dynamically get the index of the column header
                    if (i === 0) {
                        nameIndex = _.indexOf(rowData, 'Item Name');
                        qtyIndex = _.indexOf(rowData, 'Current Stock');
                        stockCodeIndex = _.indexOf(rowData, 'SKU code');
                    } else {
                        let qty = _.parseInt(rowData[qtyIndex]);

                        if (lookUpData.length > 0) {
                            for (const data of lookUpData) {
                                const skuCodeStockFile = formatToString(data['SKU code']);
                                const skuCodeCsvFile = formatToString(rowData[stockCodeIndex]);

                                if (skuCodeStockFile === skuCodeCsvFile) {
                                    qty = 0;
                                    break;
                                }
                            }
                        }

                        if (_.isInteger(qty)) {
                            if (qty > 30) {
                                csvData.push({
                                    Name: rowData[nameIndex],
                                    Stock: 30,
                                    ExternalID: rowData[stockCodeIndex]
                                });
                            } else {
                                csvData.push({
                                    Name: rowData[nameIndex],
                                    Stock: qty,
                                    ExternalID: rowData[stockCodeIndex]
                                });
                            }
                        }
                    }
                }
            } else {
                sendEmail('HBJB Stock Update - Blank stock file', `CSV File: ${csvFileNameUsed} is a blank stock file. Please coordinate this with the supplier.`);
            }

            return csvData;
        }

        function formatToString(val) {
            return val ? val.toString().trim().toLowerCase() : val;
        }

        function getInternalId() {
            // logAudit('Execute getInternalId function');

            const resultSet = search.load({
                id: 1486 // Search ID of the saved search
            }).run();
            const results = resultSet.getRange({ start: 0, end: 200 });
            const csvFileName = 'Report for latestbuy.csv';
            const dateToday = moment().add(13, 'hours').format('DD/MM/YYYY'); // I used 05/08/2021 for testing
            let internalId = '';

            csvFileNameUsed = `${csvFileName} - ${dateToday}`;

            for (const result of results) {
                const searchFile = result.getValue({ name: 'name' });
                const dateCreated = getDateCreated(result.getValue({ name: 'created' })); // I used 05/08/2021 for testing

                if (csvFileName === searchFile && dateToday === dateCreated) {
                    internalId = result.getValue({ name: 'internalid' });
                    break;
                }
            }

            return internalId;
        }

        function getDateCreated(dateCreated) {
            let formattedDate;

            if (!!dateCreated) {
                const splittedDateCreated = dateCreated.split(' '); // ex. 17/6/2021 4:43 AM
                const splittedDate = splittedDateCreated[0].split('/'); // ex. 17/6/2021
                const month = splittedDate.splice(1, 1); // ex. 6

                splittedDate.splice(0, 0, month[0]); // 6/17/2021
                formattedDate = moment(splittedDate.join('/')).format('DD/MM/YYYY'); // ex. 17/06/2021
            }

            return formattedDate;
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

        function logError(title, details = '') {
            log.error({
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
                custscript_hbjb_last_processed_ids: lastCompletedInternalID
            };

            return scheduledScriptTask.submit();
        }

        function getExternalIDs(csvData) {
            return csvData.map(data => data.ExternalID);
        }

        function getLookUpData() {
            // logAudit('Execute checkLookUpData function');

            let excelData = [];

            try {
                // XLSX File
                const excelFile = file.load({
                    id: 5592125
                }).getContents();
                const workbook = XLSX.read(excelFile, {
                    type: 'base64'
                });

                // Fetch the name of first sheet
                const firstSheet = workbook.SheetNames[0]; // Assuming that we only need the first sheet

                // Read all rows from the first sheet into an JSON array.
                excelData = XLSX.utils.sheet_to_row_object_array(workbook.Sheets[firstSheet]);
            } catch (err) {
                sendEmail('HBJB Stock Update - Stock override file not found', 'Could not find the Excel file. Please check manually.');
                // logError('Stock override file not found!');
            }

            return excelData;
        }

        function getStock(csvData, externalid, product) {
            let stock;

            csvData.forEach((data) => {
                if (externalid === data.ExternalID) {
                    stock = data.Stock;
                }
            });

            if (stock === undefined) {
                // logDebug('This product has no reference in the CSV data', `Product: ${product}, External ID: ${externalid}`);
            }

            return stock || 0; // If stock is undefined, substitute it with a zero
        }

        function sendEmail(subject, content) {
            const options = {};
            options.author = -5;
            options.recipients = ['niel.cabrera@latestbuy.com.au', 'systems@latestbuy.com.au'];
            options.subject = subject;
            options.body = `${content}\n\n`;
            email.send(options);
        }

        function execute(context) {
            try {
                updateProductStocks();
            } catch (error) {
                sendEmail('HBJB Inventory Update Script Error', `Error: ${error}`);
                // logError('HBJB Inventory Update Script Error', error);
            }
        }

        return { execute };
    });
