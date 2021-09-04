/**
 *@NApiVersion 2.x
 *@NScriptType ScheduledScript
 *@NModuleScope Public
 *@NAmdConfig ./LibraryConfig.json
 */
define(['N/file', 'N/log', 'N/runtime', 'N/task', 'N/search', 'N/error', 'N/format', 'N/record', 'N/currentRecord', 'lodash', 'moment', 'N/email'], function (file, log, runtime, task, search, error, format, record, currentRecord, lodash, moment, email) {

    //Notification recipients
    var recipients = ['vish.patel@latestbuy.com.au', 'systems@latestbuy.com.au'];

    function execute(context) {

        var lastProcessedID = null;
        var _params = {};
        var get_prod = {};

        try {

            _params.LastProccessedID = runtime.getCurrentScript().getParameter("custscript_jasnor_last_processed_ids");
            if (_params.LastProccessedID != '' && _params.LastProccessedID != null) {
                lastProcessedID = _params.LastProccessedID;
            }

            //Get all products from CSV
            var _prod_items = jasnor_product(get_prod);

            log.error("_prod_items", _prod_items.length)

            //Process products
            if(_prod_items.length > 0) {
                UpdateJasnorInventory(_prod_items, lastProcessedID);
            }

            log.error("JASNOR STOCK UPDATE STATUS", "Completed");

        } catch (e) {
            log.error(e);

            //Send Email
            sendEmail("Jasnor Inventory Update Script Error", "Error: " + e);
        }
    }

    function UpdateJasnorInventory(_items, lastProcessedID) {

        var item = {};

        _.forEach(_items, function (product) {
            item[product.Item_Code] = product;
        });

        var _externalID = Object.keys(item).map(function (k) {
            return "" + item[k].Item_Code
        });

        var endloop = false;
        if (_externalID.length > 0) {

            var _columns = [];
            _columns.push(search.createColumn({name: "internalid", sort: search.Sort.ASC}));
            _columns.push(search.createColumn({name: "externalid"}));
            _columns.push(search.createColumn({name: "displayname"}));

            var _filters = new Array();

            log.error("lastProcessedID", lastProcessedID)

            if(lastProcessedID) {
                _filters.push(search.createFilter({
                    name: 'formulanumeric',
                    operator: search.Operator.GREATERTHAN,
                    values: lastProcessedID,
                    formula: '{internalid}'
                }));
            }

            _filters.push(search.createFilter({
                name: 'vendor',
                operator: search.Operator.ANYOF,
                values: '473020'
            }));

            _filters.push(search.createFilter({
                name: 'custitem_is_inactive',
                operator: search.Operator.IS,
                values: 'F'
            }));

            _filters.push(search.createFilter({
                name: 'matrix',
                operator: search.Operator.IS,
                values: 'F'
            }));

            var _inventoryItemSearch = search.create({
                type: search.Type.INVENTORY_ITEM,
                filters: _filters,
                columns: _columns
            });

            var itemCount = 0;
            var lastCompletedInternal_ID = null;
            var checked_stock = 0;

            var _inv_result = _inventoryItemSearch.runPaged({
                pageSize: 1000
            });

            for (var _z = 0; _z < _inv_result.pageRanges.length; _z++) {

                var _currPage = _inv_result.fetch(_z);
                log.debug("_CurrPage", _currPage);

                for (var z = 0; z < _currPage.data.length; z++) {
                    var _res_currPage = _currPage.data[z];

                    log.debug("_res_currPage", _res_currPage);

                    if (runtime.getCurrentScript().getRemainingUsage() < 400 && lastCompletedInternal_ID) {
                        log.debug("STATUS Rescheduling script with last completed process ID", lastCompletedInternal_ID);
                        rescheduleCurrentScript(lastCompletedInternal_ID);
                        endloop = true;
                        break;
                    }

                    var _intenalID = _currPage.data[z].getValue({
                        name: 'internalid'
                    });
                    var _external_ID = _currPage.data[z].getValue({
                        name: 'externalid'
                    });

                    if (typeof (item[_external_ID]) !== "undefined") {
                        if (item[_external_ID].hasOwnProperty("In_Stock")) {
                            if (item[_external_ID].In_Stock != '' || item[_external_ID].In_Stock == 0 || item[_external_ID].In_Stock == 10) {
                                checked_stock = item[_external_ID].In_Stock;
                            } else {
                                log.debug("ERROR VALUE FOR STOCK FOR THIS EXTERNAL ID", item[_external_ID].Item_Code);
                            }
                        }
                    } else {
                        log.error("EXTERNAL ID ERROR", "Check external ID");
                    }

                    //For testing.
                    var allowed = ["AF122740"];

                        //submit updated data into NetSuite
                        var submit_update = record.submitFields({
                            type: record.Type.INVENTORY_ITEM,
                            id: _intenalID,
                            values: {
                                custitemjasnor_stock: checked_stock
                            },
                            options: {
                                enableSourcing: false,
                                ignoreMandatoryFields: true
                            }
                        });

                    lastCompletedInternal_ID = _intenalID;
                    itemCount++;
                }
                if (endloop) {
                    break;
                }

            }
            log.error("Items Updates", itemCount);
        }
    }

    function rescheduleCurrentScript(ID) {

        var sched_Task = task.create({
            taskType: task.TaskType.SCHEDULED_SCRIPT
        });

        sched_Task.scriptId = runtime.getCurrentScript().id;
        sched_Task.deploymentId = runtime.getCurrentScript().deploymentId;
        sched_Task.params = {
            'custscript_jasnor_last_processed_ids': ID
        };

        return sched_Task.submit();
    }

    function jasnor_product(_data) {

        var _jasnor_prod_nCabinet = [];

        var _id = 'customsearch1486';
        var _savedSearchId = search.load({
            id: _id
        });

        var _count = _savedSearchId.runPaged().count;

        var y = 0;
        var _exceed = false;
        var _last_modified_file = [];
        var found = false;
        var _jasnorFileID = null;
        var _get_datas = [];
        var datas = {};
        if (_count > 1000) {
            y = 1000;
            _exceed = true;
        } else {
            y = _count;
            _exceed = false;
        }

        var _pagedserch = _savedSearchId.runPaged({
            pageSize: 1000
        });

        for (var s = 0; s < _pagedserch.pageRanges.length; s++) {

            var _curr_pagedserch = _pagedserch.fetch(s);
            for (var _s = 0; _s < _curr_pagedserch.data.length; _s++) {
                var _tdatemod = _curr_pagedserch.data[_s].getValue({
                    name: 'modified'
                });

                var _tname = _curr_pagedserch.data[_s].getValue({
                    name: 'name'
                });

                if (_tname == "latestbuy.csv") {
                    var _tInternalID = _curr_pagedserch.data[_s].getValue({
                        name: 'internalid'
                    });

                    _last_modified_file.push({
                        "fileID": _tInternalID,
                        "date": _tdatemod
                    });

                    found = true;

                }
            }

            if (found) {
                break;
            }

        }

        if (_last_modified_file.length > 0) {

            /*_last_modified_file.sort(function (a, b) {
                return new Date(b.date) - new Date(a.date);
            });

            _last_modified_file.sort(function (left, right) {
                return moment.utc(left.date.timeStamp).diff(moment.utc(right.date.timeStamp))
            });*/

            //var currentDate = moment(new Date()).format("D/M/YYYY");
            var currentDate = moment().add(7,'hours').format("D/M/YYYY");
            var latestFileDate = _last_modified_file[0].date.split(' ')[0];

            log.error("latestFileDate", latestFileDate);
            log.error("currentDate", currentDate);

            if(currentDate == latestFileDate) {

                _jasnorFileID = _last_modified_file[0].fileID;
                var _file = file.load({
                    id: _jasnorFileID
                });

                var iterator = _file.lines.iterator();
                var _x = 0;
                iterator.each(function (x) {
                    var y = x.value.split(",");

                    //Check if first line
                    if (y[0] == 'Item Code') {
                        return true;
                    }

                    _jasnor_prod_nCabinet.push({
                        'Item_Code': y[0],
                        'Discontinued': y[1],
                        'In_Stock': y[2]
                    });
                    _x++
                    return true;
                });
            }
            else {
                sendEmail("JASNOR Stock Update - Stock file not found", "Could not find the stock CSV file. Please check manually.");
            }
        }

        return _jasnor_prod_nCabinet;
    }

    return {
        execute: execute
    }

    function inArray(needle, haystack) {
        var length = haystack.length;
        for (var i = 0; i < length; i++) {
            if (haystack[i] == needle) return true;
        }
        return false;
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

});








