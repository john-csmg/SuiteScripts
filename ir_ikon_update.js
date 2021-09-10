/**
 *@NApiVersion 2.1
 *@NScriptType ScheduledScript
 *@NModuleScope Public
 *@NAmdConfig ./LibraryConfig2.json
 */

define(['N/record', 'N/log', 'N/search', 'N/runtime', 'N/email', 'N/file', 'lodash', 'moment', 'N/task', 'jszip', 'xlsx'],
    function (record, log, search, runtime, email, file, _, moment, task, JSZIP, XLSX) {
        function updateProductStocks() {
            const internalId = getInternalId();

            if (internalId !== '') {
                const excelData = getExcelData(internalId);
                const externalIDs = getExternalIDs(excelData);

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

                            logDebug(runtime.getCurrentScript().getRemainingUsage());

                            // For governance purposes
                            endLoop = checkUsage(lastCompletedInternalID);

                            if (endLoop) {
                                break;
                            }

                            // Updating of stock
                            submitStockUpdate(result, excelData);

                            // Set the last processed id
                            lastCompletedInternalID = result.getValue({ name: 'internalid' });
                            itemcount++;
                        }

                        if (endLoop) {
                            break;
                        }
                    }

                    logAudit('Item Count', itemcount);
                }
            } else {
                logDebug('File not found!');
                // sendEmail('IKON Stock Update - Stock file not found', 'Could not find the stock CSV file. Please check manually');
            }
        }

        function submitStockUpdate(result, excelData) {
            const internalid = result.getValue({ name: 'internalid' });
            const externalid = result.getValue({ name: 'externalid' });
            const displayname = result.getValue({ name: 'displayname' });
            const stock = getStock(excelData, externalid, displayname);

            const values = {};
            values.displayname = displayname;
            values.externalId = externalid;
            values.stock = stock;

            logDebug(values);

            // record.submitFields({
            //     type: record.Type.INVENTORY_ITEM,
            //     id: internalid,
            //     values: {
            //         custitem_ikon_stock: stock
            //     },
            //     options: {
            //         enablesourcing: false,
            //         ignoreMandatoryFields: true
            //     }
            // });
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
            logAudit('Execute getInventoryItemSearch function');

            const lastProccessedID = runtime.getCurrentScript().getParameter('custscript_ikon_last_processed_ids');
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
                values: '2242'
            }));

            inventoryItemSearch = search.create({
                type: search.Type.INVENTORY_ITEM,
                filters,
                columns
            });

            return inventoryItemSearch;
        }

        function getExcelData(internalId) {
            logAudit('Execute getExcelData function');

            try {
                // XLSX File
                const excelFile = file.load({
                    id: internalId // 5607633 Used for testing
                });
                const workbook = XLSX.read(excelFile.getContents(), {
                    type: 'base64'
                });

                // Fetch the name of first sheet
                const firstSheet = workbook.SheetNames[0]; // Assuming that we only need the first sheet

                // Read all rows from the first sheet into an JSON array.
                const excelContent = XLSX.utils.sheet_to_csv(workbook.Sheets[firstSheet]).split('\n');
                const excelData = [];
                let externalIdIndex;
                let productIndex;
                let stockIndex;
                let rrpIndex;

                if (excelContent.length > 0) {
                    for (let i = 0; i < excelContent.length - 1; i++) {
                        /*
                         * split - splitted into array with special handling
                         * special handling - when text is enclosed in a quotation mark even if it has a comma in it, it is not included in the array split
                         * map - remove extra space
                        */
                        const rowData = excelContent[i].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(txt => txt.trim());

                        // Dynamically get the index of the column header
                        if (i === 0) {
                            externalIdIndex = _.indexOf(rowData, 'Product Code');
                            productIndex = _.indexOf(rowData, 'Product Title');
                            stockIndex = _.indexOf(rowData, 'Free Stock');
                            rrpIndex = _.indexOf(rowData, 'RRP ($)');
                        } else {
                            const stock = getProductStock(rowData[stockIndex], rowData[rrpIndex]);

                            excelData.push({
                                externalId: rowData[externalIdIndex],
                                product: rowData[productIndex],
                                stock
                            });
                        }
                    }
                } else {
                    logError('Feed file not found!');
                }

                return excelData;
            } catch (err) {
                logError('Error:', err);
            }
        }

        function getProductStock(freeStock, rrp) {
            const rrpVal = () => {
                let val;

                if (rrp > 200) {
                    val = 13;
                } else if (Number(rrp) <= 50 || isNaN(Number(rrp))) {
                    val = 11;
                } else {
                    val = 12;
                }

                return val;
            };
            const freeStockRef = {
                '100 +': 24,
                '< 100': 23,
                '< 50': 22,
                '< 20': rrpVal(),
                'exact qty not avail': 0
            };

            return freeStockRef[freeStock.toLowerCase()] || 0; // if undefined, 0
        }

        function getInternalId() {
            logAudit('Execute getInternalId function');

            const resultSet = search.load({
                id: 1486 // Search ID of the saved search
            }).run();
            const results = resultSet.getRange({ start: 0, end: 200 });
            const dateToday = moment().format('D.M.YY'); // 13.8.21 for testing
            const csvFileName = `Free Stock Report ${dateToday}.xlsx`;
            let internalId = '';

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
                custscript_ikon_last_processed_ids: lastCompletedInternalID
            };

            return scheduledScriptTask.submit();
        }

        function getExternalIDs(excelData) {
            return excelData.map(data => data.externalId);
        }

        function getStock(excelData, externalid, product) {
            let stock;

            excelData.forEach((data) => {
                if (externalid === data.externalId) {
                    stock = data.stock;
                }
            });

            if (stock === undefined) {
                logDebug('This product has no reference in the CSV data', `Product: ${product}, External ID: ${externalid}`);
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
                // sendEmail('IKON Inventory Update Script Error', 'Error: ' + error);
                logError('IKON Inventory Update Script Error', error);
            }
        }

        return { execute };
    });
