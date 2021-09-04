/**
 *@NApiVersion 2.x
 *@NScriptType ScheduledScript
 *@NModuleScope Public
 *@NAmdConfig ./LibraryConfig.json
 */
define(['N/record', 'N/https', 'N/xml', 'N/log', 'N/search', 'N/format', 'N/runtime', 'N/email', 'N/file', 'Crypto', 'lodash', 'moment', 'N/task'],
    function (record, https, xml, log, search, format, runtime, email, file, CryptoJS, _, moment, task) {

        function solution1() {
            // ----> Solution 1: Not Recommended <----
            var loadFile = file.load({
                id: `~/product_feed_${moment().subtract(1, 'days').format('YYYY_MM_DD')}.csv` //file path and filename of the csv file
            });

            var allBrandsToys = task.create({
                taskType: task.TaskType.CSV_IMPORT,
                // deploymentId: string,
                // params: Object | Array<string | boolean | number>,
                // scriptId: number | string,
                importFile: loadFile,
                // linkedFiles: Object,
                mappingId: 1,
                name: "", //"jobName", "job1Import" sample
                // queueId: number,
                // dedupeMode: string,
                // entityType: string,
                // masterRecordId: number,
                // masterSelectionMode: string,
                // recordIds: number[],
                // recordId: number,
                // recordType: string,
                // workflowId: number | string,
                // fileId: number,
                // filePath: string,
                // query: query.Query | string,
                // savedSearchId: string
            });

            // Finding the equivalent to 2.0 (Failed) -> nlapiSubmitCSVImport(allBrandsToys) -> used .submit() wild guess.
            allBrandsToys.submit();
        }

        function solution2() {
            // ----> Solution 2: I have problem with the search type <----
            let columns = [];

            columns.push(search.createColumn({
                name: 'internalid',
            }));

            columns.push(search.createColumn({
                name: 'externalid'
            }));

            var csvFile = search.create({
                type: search.Type.INVENTORY_ITEM, // Prospect type: INVENTORY_ITEM, NON_INVENTORY_ITEM, DOWNLOAD_ITEM. Kindly provide the right search type if it is not included in my prospect search type
                filters: `product_feed_${moment().subtract(1, 'days').format('YYYY_MM_DD')}.csv`,
                columns
            }).run();
        }

        function solution3(context) {
            // ----> Solution 3: Use of Global search  <----
            // Not sure if I still need to call .run() to execute the search
            // But I assume that it will execute the search automatically. Return is search.Result[]
            const csvFileSearch = search.global({
                keywords: `product_feed_${moment().subtract(1, 'days').format('YYYY_MM_DD')}.csv` // product_feed_2020_08_13.csv
            });
            let internalId;
            let searchType;

            if (_.size(csvFileSearch) > 0) {
                // Try 1
                internalId = csvFileSearch.searchId;
                searchType = csvFileSearch.searchType;

                // Try 2
                // internalId = csvFileSearch[0].searchId;
                // searchType = csvFileSearch[0].searchType;

                // Try 3
                // for (const csvFile of csvFileSearch) {
                //     internalId = csvFile.searchId;
                //     searchType = csvFile.searchType;
                // }

                // Note:
                // I have provided 3 different try codes above since I can't see the result
                // Kindly comment the wrong codes and uncomment the correct code
                // Kindly also comment the value of the searchType beside the correct code
            } else {
                sendEmail();
            }

            const currentRecord = context.currentRecord;

            // For Try 2
            const folder = currentRecord.getText({ fieldId: 'folder' });
            // const folder = record.getText({ fieldId: 'folder' }); // Try this if currentRecord is a wrong approach

            // For Try 3
            // const folder = currentRecord.getValue({ fieldId: 'folder' });
            // const folder = record.getValue({ fieldId: 'folder' }); // Try this if currentRecord is a wrong approach

            const path = folder.split(":").join("/").replace(/\s+/g, '');
            const csvFile = file.load({
                // Try 1 -> Let see if using tilde will get the full path of the csv file
                id: `~/product_feed_${moment().subtract(1, 'days').format('YYYY_MM_DD')}.csv`

                // Try 2 -> Getting the value through Field ID using getText
                // id: `${path}/product_feed_${moment().subtract(1, 'days').format('YYYY_MM_DD')}.csv`

                // Try 3 -> Getting the value through Field ID using getValue
                // id: `${path}/product_feed_${moment().subtract(1, 'days').format('YYYY_MM_DD')}.csv`

                // Try 4
                // id: internalId
            });
            let csvData = [];
            let qtyIndex;
            let stockCodeIndex;

            csvFile.lines.iterator().each(line => {
                let row = line.value.split(',');

                if (_.indexOf(row, 'Qty') > 0 && _.indexOf(row, 'Stockcode') > 0) {
                    qtyIndex = _.indexOf(row, 'Qty');
                    stockCodeIndex = _.indexOf(row, 'Stockcode');
                    return false;
                }

                if (_.isInteger(_.parseInt(row[qtyIndex]))) {
                    if (_.parseInt(row[qtyIndex]) > 50) {
                        csvData.push({
                            Name: row[0],
                            AllBrandsStock: 50,
                            ExternalID: row[stockCodeIndex]
                        });
                    } else {
                        csvData.push({
                            Name: row[0],
                            AllBrandsStock: row[qtyIndex],
                            ExternalID: row[stockCodeIndex]
                        });
                    }

                    return true;
                }
            });

            const externalIDs = csvData.map((data) => { return data.ExternalID });

            if (externalIDs?.length > 0) {
                const lastProccessedID = runtime.getCurrentScript().getParameter('custscript_vr_last_processed_id'); // Kindly provide the correct field id
                let columns = [];
                let filters = []

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
                    values: '2034'
                }));

                const inventoryitemSearch = search.create({
                    type: search.Type.INVENTORY_ITEM,
                    filters: filters,
                    columns: columns
                });
                const pagedData = inventoryitemSearchmySearch.runPaged({
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

                        //Check Usage
                        if (runtime.getCurrentScript().getRemainingUsage() < 400 && lastCompletedInternalID) {
                            log.debug("Status", 'Rescheduling script. Last processed id: ' + lastCompletedInternalID);
                            rescheduleCurrentScript(lastCompletedInternalID);
                            endLoop = true;
                            break;
                        }

                        //Get product data
                        const internalid = result.getValue({ name: 'internalid' });
                        const externalid = result.getValue({ name: 'externalid' });
                        let stock;

                        csvData.forEach((data) => {
                            if (externalid === data.ExternalID) {
                                stock = data.AllBrandsStock
                            }
                        });

                        let debug = {};
                        debug['Internal ID'] = internalid;
                        debug['External ID'] = externalid;
                        debug['Name'] = displayname;
                        debug['Stock'] = stock;

                        log.debug("Product Data", debug);

                        // record.submitFields({
                        //     type: record.Type.INVENTORY_ITEM, // Kindly change if record type is wrong
                        //     id: internalid,
                        //     values: {
                        //         custitem_ab_stock: stock
                        //     },
                        //     options: {
                        //         enablesourcing: false,
                        //         ignoreMandatoryFields: true
                        //     }
                        // });

                        lastCompletedInternalID = internalid;
                        itemcount++;
                    }

                    if (endLoop) {
                        break;
                    }
                }

                log.debug("Items Updated", itemcount);
            }
        }

        function solution4() {
            // ----> Solution 4: Saved Search <---- 
            const resultSet = search.load({
                id: 1486 // Saved search provided by shaun
            }).run();
            const results = resultSet.getRange({ start: 0, end: 10 });
            const csvFile = `product_feed_${moment().subtract(1, 'days').format('YYYY_MM_DD')}.csv`;
            let internalId;

            for (const result of results) {
                // Try 1 -> using .getValue
                const searchFile = result.getValue({ name: "name" });

                if (csvFile === searchFile) {
                    internalId = result.getValue({ name: "internalid" });
                }

                // Try 2 -> using .getText
                // const searchFile = result.getText({ name: "name" });

                // if (csvFile === searchFile) {
                //     internalId = result.getText({ name: "internalid" });
                // }

                // I'm confused with the two: getValue vs getText
                // I don't know yet the differences so I provided them both
                // Same process, uncomment the correct code. Comment the wrong code
            }

            const csvFile = file.load({
                id: internalId
            });
            let csvData = [];
            let qtyIndex;
            let stockCodeIndex;

            csvFile.lines.iterator().each(line => {
                let row = line.value.split(',');

                if (_.indexOf(row, 'Qty') > 0 && _.indexOf(row, 'Stockcode') > 0) {
                    qtyIndex = _.indexOf(row, 'Qty');
                    stockCodeIndex = _.indexOf(row, 'Stockcode');
                    return false;
                }

                if (_.isInteger(_.parseInt(row[qtyIndex]))) {
                    if (_.parseInt(row[qtyIndex]) > 50) {
                        csvData.push({
                            Name: row[0],
                            AllBrandsStock: 50,
                            ExternalID: row[stockCodeIndex]
                        });
                    } else {
                        csvData.push({
                            Name: row[0],
                            AllBrandsStock: row[qtyIndex],
                            ExternalID: row[stockCodeIndex]
                        });
                    }

                    return true;
                }
            });

            const externalIDs = csvData.map((data) => { return data.ExternalID });

            if (externalIDs?.length > 0) {
                const lastProccessedID = runtime.getCurrentScript().getParameter('custscript_vr_last_processed_id'); // Kindly provide the correct field id
                let columns = [];
                let filters = []

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
                    values: '2034'
                }));

                const inventoryitemSearch = search.create({
                    type: search.Type.INVENTORY_ITEM,
                    filters: filters,
                    columns: columns
                });
                const pagedData = inventoryitemSearchmySearch.runPaged({
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

                        //Check Usage
                        if (runtime.getCurrentScript().getRemainingUsage() < 400 && lastCompletedInternalID) {
                            log.debug("Status", 'Rescheduling script. Last processed id: ' + lastCompletedInternalID);
                            rescheduleCurrentScript(lastCompletedInternalID);
                            endLoop = true;
                            break;
                        }

                        //Get product data
                        const internalid = result.getValue({ name: 'internalid' });
                        const externalid = result.getValue({ name: 'externalid' });
                        const displayname = result.getValue({ name: 'displayname' });
                        let stock;

                        csvData.forEach((data) => {
                            if (externalid === data.ExternalID) {
                                stock = data.AllBrandsStock
                            }
                        });

                        let debug = {};
                        debug['Internal ID'] = internalid;
                        debug['External ID'] = externalid;
                        debug['Name'] = displayname;
                        debug['Stock'] = stock;

                        log.debug("Product Data", debug);

                        // record.submitFields({
                        //     type: record.Type.INVENTORY_ITEM, // Kindly change if record type is wrong
                        //     id: internalid,
                        //     values: {
                        //         custitem_ab_stock: stock
                        //     },
                        //     options: {
                        //         enablesourcing: false,
                        //         ignoreMandatoryFields: true
                        //     }
                        // });

                        lastCompletedInternalID = internalid;
                        itemcount++;
                    }

                    if (endLoop) {
                        break;
                    }
                }

                log.debug("Items Updated", itemcount);
            }
        }

        function rescheduleCurrentScript(value) {
            var scheduledScriptTask = task.create({
                taskType: task.TaskType.SCHEDULED_SCRIPT
            });

            scheduledScriptTask.scriptId = runtime.getCurrentScript().id;
            scheduledScriptTask.deploymentId = runtime.getCurrentScript().deploymentId;
            scheduledScriptTask.params = {
                'custscript_vr_last_processed_id': value, // Kindly provide the correct field id
            };

            return scheduledScriptTask.submit();
        }

        function execute(context) {
            // Put the selected solution method here
        }

        function sendEmail() {
            const author = -5;
            const subject = 'Warning: Product feed csv not found';
            const body = `Please be informed that product_feed_${moment().subtract(1, 'days').format('YYYY_MM_DD')}.csv was not found in the global search. \n\n\n
            THIS IS AN AUTOMATED MESSAGE - PLEASE DO NOT REPLY DIRECTLY TO THIS EMAIL`;
            const recipients = ['systems@latestbuy.com.au'];
            const bcc = ['john.ian.recio@gmail.com'];

            email.send({
                author,
                subject,
                body,
                recipients,
                bcc
            });
        }

        return { execute };
    });
