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
                // logDebug('File not found!');
                sendEmail('BMS Stock Update - Stock file not found', `Could not find the stock CSV file. \n CSV File: ${csvFileNameUsed}`);
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

            // logDebug(values);

            record.submitFields({
                type: record.Type.INVENTORY_ITEM,
                id: internalid,
                values: {
                    custitem_bs_stock: stock
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

            const lastProccessedID = runtime.getCurrentScript().getParameter('custscript_bs_last_processed_ids');
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
                values: '2831307'
            }));

            inventoryItemSearch = search.create({
                type: search.Type.INVENTORY_ITEM,
                filters,
                columns
            });

            return inventoryItemSearch;
        }

        function getExcelData(internalId) {
            // logAudit('Execute getExcelData function');

            try {
                // XLSX File
                const excelFile = file.load({
                    id: internalId // 5605532 Used for testing
                });
                const workbook = XLSX.read(excelFile.getContents(), {
                    type: 'base64'
                });

                // Fetch the name of first sheet
                const firstSheet = workbook.SheetNames[0]; // Assuming that we only need the first sheet

                // Read all rows from the first sheet into an JSON array.
                const excelContent = XLSX.utils.sheet_to_csv(workbook.Sheets[firstSheet]).split('\n');

                const excelData = [];

                if (excelContent.length > 0) {
                    for (let i = 11; i < excelContent.length - 1; i++) {
                        /*
                         * split - splitted into array with special handling
                         * special handling - when text is enclosed in a quotation mark even if it has a comma in it, it is not included in the array split
                         * map - remove extra space
                        */
                        const rowData = excelContent[i].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(txt => txt.trim());

                        excelData.push({
                            externalId: `BS-${rowData[0]}`,
                            product: rowData[1],
                            stock: rowData[2] > 30 ? 30 : rowData[2]
                        });
                    }

                    return excelData;
                } else {
                    // logError('Feed file not found!');
                    sendEmail('BMS Stock Update - Stock file not found', `Could not find the stock CSV file. \n CSV File: ${csvFileNameUsed}`);
                }
            } catch (err) {
                sendEmail('BMS Inventory Update Script Error', `Error: ${err}`);
                // logError(err);
            }
        }

        function getInternalId() {
            // logAudit('Execute getInternalId function');

            const resultSet = search.load({
                id: 1486 // Search ID of the saved search
            }).run();
            const results = resultSet.getRange({ start: 0, end: 200 });
            const fileDate = moment().add(13, 'hours').format('YYYYMMDD');
            const csvFileName = `BMSSF_${fileDate}`;
            const dateToday = moment().add(13, 'hours').format('DD/MM/YYYY');
            const temp = [];
            let ctr = 0;

            csvFileNameUsed = `${csvFileName} ${dateToday}`;

            for (const result of results) {
                const searchFile = result.getValue({ name: 'name' });
                const dateCreated = getDateCreated(result.getValue({ name: 'created' }));

                if (searchFile.includes(csvFileName) && dateToday === dateCreated[0].formattedDate) {
                    const data = {
                        internalid: result.getValue({ name: 'internalid' }),
                        nsDate: result.getValue({ name: 'created' }),
                        datetime: parseDateTime(result.getValue({ name: 'created' }), dateCreated[0].regularFormatDate)
                    };

                    temp.push(data);
                    ctr++;

                    if (ctr === 3) {
                        break;
                    }
                }
            }

            temp.sort((a, b) => {
                const x = a.time;
                const y = b.time;

                if (x > y) { return -1; }
                if (x < y) { return 1; }

                return 0;
            });

            return temp[0].internalid;
        }

        function parseDateTime(dateCreated, regularDate) {
            const time = dateCreated.split(' ').splice(1, 2);
            return moment(`${regularDate} ${time.join(' ')}`).format();
        }

        function getDateCreated(dateCreated) {
            const formattedDate = [];

            if (!!dateCreated) {
                const splittedDateCreated = dateCreated.split(' '); // ex. 17/6/2021 4:43 AM
                const splittedDate = splittedDateCreated[0].split('/'); // ex. 17/6/2021
                const month = splittedDate.splice(1, 1); // ex. 6

                splittedDate.unshift(month[0]); // 6/17/2021

                formattedDate.push({
                    regularFormatDate: splittedDate.join('/'),
                    formattedDate: moment(splittedDate.join('/')).format('DD/MM/YYYY')
                });
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
                custscript_bs_last_processed_ids: lastCompletedInternalID
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
            options.recipients = ['vish.patel@latestbuy.com.au', 'systems@latestbuy.com.au'];
            options.cc = ['john.ian.recio@gmail.com'];
            options.subject = subject;
            options.body = `${content}\n\n`;
            email.send(options);
        }

        function execute(context) {
            try {
                updateProductStocks();
            } catch (error) {
                sendEmail('BMS Inventory Update Script Error', `Error: ${error}`);
                // logError('BMS Inventory Update Script Error', error);
            }
        }

        return { execute };
    });
