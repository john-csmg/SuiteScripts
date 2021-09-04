/**
 *@NApiVersion 2.x
 *@NScriptType ScheduledScript
 *@NModuleScope Public
 *@NAmdConfig ./LibraryConfig.json
 */
 define(['N/file', 'N/log','N/runtime','N/task','N/search','N/error','N/format','N/record','N/currentRecord','lodash','moment','N/email'], 
 function(file,log,runtime,task,search,error,format,record,currentRecord,lodash,moment,email) {

    //Notification recipients
    var recipients = ['vish.patel@latestbuy.com.au', 'systems@latestbuy.com.au'];

    function execute(context) {
    
    //****/--variable declaration
    
     var lastProcessedID = null;
     var _params = {};
     var get_prod = {};
    
    //***/
    try {
         
          _params.LastProccessedID = runtime.getCurrentScript().getParameter('custscript_electus_techbrands_last_processed_ids');//inform Vish about params id
          if(_params.LastProccessedID != '' && _params.LastProccessedID != null){
            lastProcessedID = _params.LastProccessedID;
            log.debug('LAST PROCESSED ID',lastProcessedID);
          }


         var _prod_items = elect_techbrands_product(get_prod);
         log.error('READ',_prod_items.length);

         if(_prod_items.length > 0)
         {
            Update_elect_techbrands_product(_prod_items, lastProcessedID);
            log.error('STATUS','SUCCESSFULLY UPDATED ! ! !');

         }
         log.error('End of Process','Done');
         
    
        } catch (e) {
            log.error(e);

            //Send Email
            // sendEmail("Jasnor Inventory Update Script Error", "Error: " + e);

        }
    }//end of function execute

    function Update_elect_techbrands_product(_items,lastProcessedID)
    {
        var item = {};

        _.forEach(_items,function(elements){
            item[elements.Product] = elements;
        });

        var _product_id = Object.keys(item).map(function(k){
            return `${  item[k].Product}`;
        });
        log.debug('External ID/Product Code to proccess',_product_id);
        var endloop = false;
        
        if(_product_id.length > 0)
        {
            var _columns = [];
            _columns.push(search.createColumn({
                name: 'internalid',
                sort: search.Sort.ASC
            }));
            _columns.push(search.createColumn({
                name: 'externalid'
            }));
            
            var _filters = new Array();
            log.error('lastProcessedID', lastProcessedID);

            if(lastProcessedID){
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
                values: '2164' //vendor id of electus/techband
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

            var itemCount = 0 ;
            var lastCompletedInternal_ID = null;
            var checked_stock = 0; //set to 0 in inventory item if new file doesn't contain the same 
            
            var _inv_result = _inventoryItemSearch.runPaged({
                pageSize: 1000
            });
            
            for (var _z = 0; _z < _inv_result.pageRanges.length; _z++) 
            {
                var _currPage = _inv_result.fetch(_z);
                log.debug('_CurrPage', _currPage);

                for (var z = 0; z < _currPage.data.length; z++) {
                    var _res_currPage = _currPage.data[z];

                    log.debug('_res_currPage', _res_currPage);

                    if(runtime.getCurrentScript().getRemainingUsage() < 400 && lastCompletedInternal_ID)
                    {
                        log.debug('STATUS Rescheduling script with last completed process ID',lastCompletedInternal_ID);
                        rescheduleCurrentScript(lastCompletedInternal_ID);
                        endloop = true;
                        break;
                    }

                    log.debug('TEST DATA FROM SEARCH RESULT',_inv_res[_z].getValue({name:'externalid'}));
                    var _intenalID = _currPage.data[z].getValue({
                        name: 'internalid'
                    });
                    var _external_ID = _currPage.data[z].getValue({
                        name: 'externalid'
                    });
                
                    if(typeofitem[_external_ID] !== 'undefined')
                    {
                        log.debug('CORRECT/FOUND MATCHED VALUE',item[_external_ID].Product);
                        if(item[_external_ID].hasOwnProperty('SOH'))
                        {

                            if(item[_external_ID].SOH == 'No Stock' || item[_external_ID].SOH == '')
                            {
                                checked_stock = 0;
                                log.debug(`Stock set to ${checked_stock}`,item[_external_ID].Product);
                            }
                            else if(item[_external_ID].SOH == 'Low Stock')
                            {
                                checked_stock = 20;
                                log.debug(`Stock set to ${checked_stock}`,item[_external_ID].Product);
                            }
                            else if(item[_external_ID].SOH == 'OK' || item[_external_ID].SOH == 'Ok')
                            {
                                checked_stock = 30;
                                log.debug(`Stock set to ${checked_stock}`,item[_external_ID.Product]);
                            }
                            else if (item[_external_ID].SOH == 'Good')
                            {
                                checked_stock = 40;
                                log.debug(`Stock set to ${checked_stock}`,item[_external_ID].Product);
                            }
                            else
                            {
                                log.debug('ERROR','Check the SOH value if there\'s changes made from file');
                                //do nothing
                            }

                        }   
                    }
                    else
                    {
                        log.error('EXTERNAL ERROR','Check external ID');
                    }

                    // var submit_update = record.submitFields({
                    //     type: record.Type.INVENTORY_ITEM, 
                    //     id: _intenalID,
                    //     values:{
                    //         custitemtelectus_stock  : checked_stock 
                    //     },
                    //     options:{ 
                    //         enableSourcing: false,
                    //         ignoreMandatoryFields : true
                    //     }
                    //  });

                 lastCompletedInternal_ID = _intenalID;
                 itemCount ++;

                }

                if(endloop)
                {
                    break;
                }
                
            }
            log.error('ITEM COUNTS',itemCount);
        
        }
      
    }
    function rescheduleCurrentScript(ID)
    {
        var sched_task = task.create({
            taskType: task.TaskType.SCHEDULED_SCRIPT
        });
        
        sched_task.scriptId = runtime.getCurrentScript().id;
        sched_task.deploymentId = runtime.getCurrentScript().deploymentId;
        sched_task.params = {
            'custscript_electus_techbrands_last_processed_ids': ID
        };
        return sched_task.submit();
    }

   
  function elect_techbrands_product(_data){
      //**[

        var _now = new Date();
        var _day = _now.getDay();
        var _day_string =  ['Sunday', 'Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
        
        var id = 'customsearch1486';
        var el_tech_xlsx_id = null;
        var _last_modified_file = [];
        var _file_name = `${moment(_now).format('DDMMYY')} price list 3.xlsx`; // test result '190621 price list 3.xlsx'

      //] **
     
      log.debug('DAY & TIME', `${_now.getHours()  } : ${_day_string[_day]}`);
      log.debug('DATE IN STRING',_now.toString());
      
      if(_day_string[_day] == 'Friday' && _now.getHours() == 12)
      {

        log.debug('SAVE SEARCH RUN',true);
        var savedsearchID = search.load({
            id
        });

        var _count = savedsearchID.runPaged().count;
        log.debug('COUNT SEARCH',_count);

        var found = false;
        var y = 0 ;
        if(_count > 1000)
        {
            y = 1000;
        }
        else
        {
            y = _count;
        }

        log.debug('FILE NAME',_file_name);

        var _pagedserch = savedsearchID.runPaged({
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

                if (_tname == _file_name) {

                    var _tInternalID = _curr_pagedserch.data[_s].getValue({
                        name: 'internalid'
                    });

                    _last_modified_file.push({
                        'fileID': _tInternalID,
                        'date': _tdatemod
                    });

                    found = true;

                }
            }

            if (found) {
                break;
            }

        }
       
      }//if end

      if (_last_modified_file.length > 0) {
        _last_modified_file.sort(function (a, b) {
            return new Date(b.date) - new Date(a.date);
        });

        var currentDate = moment(new Date()).format('D/M/YYYY');
        var latestFileDate = _last_modified_file[0].date.split(' ')[0];

        log.error('latestFileDate', latestFileDate);
        log.error('currentDate', currentDate);

        if(currentDate == latestFileDate) {
        
            el_tech_xlsx_id = _last_modified_file[0].fileID;
            var _file = file.load({
                id: el_tech_xlsx_id
            });


            var iterator = _file.lines.iterator();
            var _x = 0;
            var _elec_tech_prod_nCabinet = [];

            iterator.each(function(x){
            var y = x.value.split(',');
            if(y[0] == 'Product')
            {
                return true;
            }
            _elec_tech_prod_nCabinet.push({
                'Product': y[0],
                'Description': y[1],
                'Retail Price':y[2],
                'Price 3':y[3],
                'SOH': y[4],
                'Barcode': y[5]
            });
            _x++;
            return true;
       });

    }else{
        log.error('file not found');
            // sendEmail("JASNOR Stock Update - Stock file not found", "Could not find the stock CSV file. Please check manually.");
        }
           
    }
    return _elec_tech_prod_nCabinet;
      
  }//end elect_techbrands_product
    
    return {
            execute: execute
    };


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
        options.body = `${content 
            }\n\n`;
        email.send(options);
    }

    
});
    
    
    
    
    
    
    
    
    
    