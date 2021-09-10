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
                        // fetch the current page data
                        const currentPage = pagedData.fetch(i);

                        for (let v = 0; v < currentPage.data.length; v++) {
                            const result = currentPage.data[v];

                            //For governance purposes
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
                // logDebug('File not found');
                sendEmail('All Brands Toys Stock Update - Stock file not found', `Could not find the stock CSV file. \n CSV File: ${csvFileNameUsed}`);
            }
        }

        function submitStockUpdate(result, csvData) {
            const internalid = result.getValue({ name: 'internalid' });
            const externalid = result.getValue({ name: 'externalid' });
            const displayname = result.getValue({ name: 'displayname' });
            const stock = getStock(csvData, externalid, displayname);

            const values = {};
            values.displayname = displayname;
            values.externalId = externalid;
            values.stock = stock;

            // logDebug(values);

            record.submitFields({
                type: record.Type.INVENTORY_ITEM, // Kindly change if record type is wrong
                id: internalid,
                values: {
                    custitem_ab_stock: stock
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

            const lastProccessedID = runtime.getCurrentScript().getParameter('custscript_abt_last_processed_ids');
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
                values: '2034'
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
            const csvData = [];
            const lookUpData = getLookUpData();
            let nameIndex;
            let qtyIndex;
            let stockCodeIndex;

            for (let i = 0; i < csvContent.length; i++) {
                /*
                 * replace - removes the carriage or \r
                 * split - splitted into array with special handling
                 * special handling: when text is enclosed in a quotation mark even if it has a comma in it, it is not included in the split
                */
                const rowData = csvContent[i].replace(/[\r]/g, '').split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);

                // dynamically get the index of the column header
                if (i === 0) {
                    nameIndex = _.indexOf(rowData, 'Name');
                    qtyIndex = _.indexOf(rowData, 'Qty');
                    stockCodeIndex = _.indexOf(rowData, 'Stockcode');
                } else {
                    let stock = _.parseInt(rowData[qtyIndex]);

                    if (lookUpData.length > 0) {
                        for (const data of lookUpData) {
                            const productCodeStockFile = formatToString(data['Stockcode']);
                            const productCodeCsvFile = formatToString(rowData[stockCodeIndex]);

                            if (productCodeStockFile === productCodeCsvFile) {
                                stock = 0;
                                break;
                            }
                        }
                    }

                    if (_.isInteger(stock)) {
                        if (stock > 50) {
                            csvData.push({
                                Name: rowData[nameIndex],
                                Stock: 50,
                                ExternalID: rowData[stockCodeIndex]
                            });
                        } else {
                            csvData.push({
                                Name: rowData[nameIndex],
                                Stock: stock,
                                ExternalID: rowData[stockCodeIndex]
                            });
                        }
                    }
                }
            }

            return csvData;
        }

        function formatToString(val) {
            return val ? val.toString().trim().toLowerCase() : val;
        }

        function getLookUpData() {
            // logAudit('Execute checkLookUpData function');

            let excelData = [];

            try {
                // XLSX File
                const excelFile = file.load({
                    id: 5680966
                }).getContents();
                const workbook = XLSX.read(excelFile, {
                    type: 'base64'
                });

                // Fetch the name of first sheet
                const firstSheet = workbook.SheetNames[0]; // Assuming that we only need the first sheet

                // Read all rows from the first sheet into an JSON array.
                excelData = XLSX.utils.sheet_to_row_object_array(workbook.Sheets[firstSheet]);
            } catch (err) {
                sendEmail('BPM Stock Update - Stock override file not found', 'Could not find the Excel file. Please check manually.');
                // logError('Stock override file not found!');
            }

            return excelData;
        }

        function getInternalId() {
            // logAudit('Execute getInternalId function');

            const resultSet = search.load({
                id: 1486 // Search ID of the saved search
            }).run();
            const results = resultSet.getRange({ start: 0, end: 200 });
            const csvFileName = `product_feed_${moment().add(13, 'hours').subtract(1, 'days').format('YYYY_MM_DD')}.csv`;
            let internalId = '';

            csvFileNameUsed = csvFileName;

            for (const result of results) {
                const searchFile = result.getValue({ name: 'name' });

                if (csvFileName === searchFile) {
                    internalId = result.getValue({ name: 'internalid' });
                    break;
                }
            }

            return internalId;
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
                'custscript_abt_last_processed_ids': lastCompletedInternalID
            };

            return scheduledScriptTask.submit();
        }

        function getExternalIDs(csvData) {
            return csvData.map(data => data.ExternalID);
        }

        function getStock(csvData, externalid, product) {
            // logAudit('Execute getStock function', `External ID: ${externalid}`);

            let stock;

            csvData.forEach((data) => {
                if (externalid === data.ExternalID) {
                    stock = data.Stock;
                }
            });

            if (stock === undefined) {
                logDebug('This product has no reference in the CSV data', `Product: ${product}, External ID: ${externalid}`);
            }

            return stock || 0; // If stock is undefined, substitute it with a zero
        }

        function sendEmail(subject, content) {
            var options = {};
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
                sendEmail('All brands Toys Inventory Update Script Error', `Error: ${error}`);
                // logError('All brands toys error', error);
            }
        }

        return { execute };
    });

