const regex = /\n/gi;

$(function () {
    const doc = $(document);

    doc.foundation();
    backNotAllowed()
    showHideHamburger();
    showBarChart();
    showTenantData();

    $(window).resize(function () {
        showHideHamburger();
    });

    $('.title-bar').click(function () {
        // Use foundation click event when document width is less than 623px
        if (doc.width() >= 623) {
            if ($(this).is(':visible')) {
                if ($('#responsive-menu').is(':visible')) {
                    $('#responsive-menu').css('display', 'none');
                } else {
                    $('#responsive-menu').css('display', 'block');
                }
            }
        }
    });

    $('.completeButton').click(function () {
        $('.arrow-steps .step').each(function () {
            $(this)
                .removeClass('current')
                .addClass('done')
                .find('span')
                .text('');
        });

        $(this).addClass('disabled');
    });

    $('.card').click(function () {
        const card = $(this).text().replace(regex, '').trim();
        const alignRightHeader = [
            'Main Contact',
            'Email'
        ]

        $('.show-for-sr').next().text(card);
        $('#dashboard').removeClass('hide');
        $('#tiles').addClass('hide');

        w2ui.tenant.refresh();
        $('.w2ui-col-header').each(function (index, header) {
            if (alignRightHeader.indexOf(header.innerText) !== -1) {
                $(header).css('text-align', 'right');
            }
        });
    });

    $('a[href="#stage-panel2"]').click(function () {
        w2ui['stage-detail'].refresh();
    });

    $(document).on('click', '.breadcrumbs a', function () {
        const clickedLink = $(this).text();

        $('#myGrid2').addClass('hide');
        $('#myGrid').removeClass('hide');

        $('#accordion-title-buttons').removeClass('hide');
        $('.accordion-title').last().removeClass('hide');
        $('#chart-here').removeClass('hide');
        $('#myGrid').removeClass('hide');
        $('#dropdown-container').removeClass('hide');

        $('#arrow-progress-bar').addClass('hide');
        $('#log-container').addClass('hide');
        $('#stage-container').addClass('hide');
        $('#stage-here')
            .addClass('hide')
            .css('display');
        $('#grid-container .accordion').each(function () {
            $(this).css('height');
            $(this).css('margin-top');
        });
        $('#grid-container .accordion-content').first().css('height');
        $('#grid-container .accordion-content').last().css('padding-top');
        // setCurrentLink($(this), clickedLink);

        switch ($(this).attr('id')) {
            case 'tenant-link':
                if (w2ui.hasOwnProperty('tenant')) {
                    w2ui['tenant'].destroy();
                }
                $('#msa-link').parent().remove();
                $('#city-link').parent().remove();
                $('#trade-link').parent().remove();
                $('.show-for-sr').parent().remove();
                $(this).parent().html(
                    '<span class=\"show-for-sr\"></span>' +
                    '<span class=\"bolder\">' + clickedLink + '</span>'
                );
                $('#addFp').removeClass('hide');
                $('#franchise').removeClass('hide');
                $('#msa').removeClass('hide');
                $('#territory').removeClass('hide');
                $('#accordion-title-buttons').children().first().text('Add MSA');
                showTenantData();
                break;
            case 'msa-link':
                if (w2ui.hasOwnProperty('msa')) {
                    w2ui['msa'].destroy();
                }
                $('#city-link').parent().remove();
                $('#trade-link').parent().remove();
                $('.show-for-sr').parent().remove();
                $('#msa').removeClass('hide');
                $('#territory').removeClass('hide');
                $('#accordion-title-buttons').children().first().text('Add MSA');
                $(this).parent().html(
                    '<span class=\"show-for-sr\"></span>' +
                    '<span class=\"bolder\">' + clickedLink + '</span>'
                );
                showMsaData();
                break;
            case 'city-link':
                if (w2ui.hasOwnProperty('site')) {
                    w2ui['site'].destroy();
                }
                $('#trade-link').parent().remove();
                $('.show-for-sr').parent().remove();
                $(this).parent().html(
                    '<span class=\"show-for-sr\"></span>' +
                    '<span class=\"bolder\">' + clickedLink + '</span>'
                );
                showSiteData();
                break;
            case 'trade-link':
                if (w2ui.hasOwnProperty('stage')) {
                    w2ui['stage'].destroy();
                }
                $('.show-for-sr').parent().remove();
                $(this).parent().html(
                    '<span class=\"show-for-sr\"></span>' +
                    '<span class=\"bolder\">' + clickedLink + '</span>'
                );
                showStageData();
                break;
            default:
                break;
        }
    });

    function showHideHamburger() {
        const docWidth = doc.width();

        if (docWidth < 1024) {
            $('.title-bar').css('display', 'block');
            $('#responsive-menu').css('display', 'none');
        } else {
            $('.title-bar').css('display', 'none');
            $('#responsive-menu').css('display', 'block');
            $('.is-right-arrow').each(function () {
                $(this)
                    .removeClass('is-right-arrow')
                    .addClass('is-down-arrow');
            })
        }
    }

    function showBarChart() {
        const canvasEl = document.getElementById('myChart').getContext('2d');
        const data = {
            labels: ['Stage 0.0', 'Stage 0.1', 'Stage 0.2', 'Stage 0.3', 'Stage 1', 'Stage 2', 'Stage 3', 'Stage 4', 'Stage 5', 'Sites Opened'],
            datasets: [{
                fill: false,
                lineTension: 0.1,
                backgroundColor: 'rgba(54, 162, 235, 0.2)',
                borderColor: 'rgb(54, 162, 235)',
                borderWidth: 1,
                data: [200, 188, 176, 155, 145, 140, 135, 141, 120, 45],
                datalabels: {
                    anchor: 'end',
                    align: 'top',
                    color: 'blue',
                    offset: 10
                }
                // barPercentage: 0.5, 
                // barThickness: 6, Resize the thickness of the bar
                // maxBarThickness: 8,
            }]
        };
        const myChart = new Chart(canvasEl, {
            type: 'bar',
            data: data,
            plugins: [ChartDataLabels],
            options: {
                plugins: {
                    legend: {
                        display: false
                    },
                },
                scales: {
                    y: {
                        display: false,
                        grid: {
                            color: 'rgba(0, 0, 0, 0)',
                        }
                    },
                    x: {
                        grid: {
                            color: 'rgba(0, 0, 0, 0)',
                        }
                    }
                },
                layout: {
                    padding: {
                        top: 25
                    }
                }
            }
        });
    }

    function showTenantData() {
        $('#combobox').empty();
        $('#combobox').append(
            '<option>Franchise Partners</option>'
        );

        if (w2ui.hasOwnProperty('tenant')) {
            w2ui['tenant'].destroy();
        }

        $('#myGrid').w2grid({
            name: 'tenant',
            // url: 'companies.json', // Better to use the .load() function
            method: 'GET',
            show: {
                toolbar: true,
                lineNumbers: true,
                // selectColumn: true // For checkbox
            },
            columns: [
                { field: 'col1', text: 'Franchise Partner Entity', size: '300px', sortable: true },
                { field: 'col2', text: 'Main Contact', size: '250px', sortable: true, attr: 'align=right' },
                { field: 'col3', text: 'Email', size: '250px', sortable: true, attr: 'align=right' },
            ],
            // records: [
            //     { recid: 1, fname: 'Peter', lname: 'Jeremia', email: 'peter@mail.com', sdate: '2/1/2010' },
            //     { recid: 2, fname: 'Bruce', lname: 'Wilkerson', email: 'bruce@mail.com', sdate: '6/1/2010' },
            //     { recid: 3, fname: 'John', lname: 'McAlister', email: 'john@mail.com', sdate: '1/16/2010' },
            //     { recid: 4, fname: 'Ravi', lname: 'Zacharies', email: 'ravi@mail.com', sdate: '3/13/2007' },
            //     { recid: 5, fname: 'William', lname: 'Dembski', email: 'will@mail.com', sdate: '9/30/2011' },
            //     { recid: 6, fname: 'David', lname: 'Peterson', email: 'david@mail.com', sdate: '4/5/2010' },
            //     { recid: 7, fname: 'David', lname: 'David', email: 'david@mail.com', sdate: '4/5/2010' }
            // ],
            onClick: function (event) {
                const grid = this;

                $.getJSON('tenant.json', function (e) {
                    const data = e.records;

                    for (const rowData of data) {
                        if (rowData.recid === grid.getSelection()[0]) {
                            changeToBreadcrumbLink(rowData.col1, 'tenant');
                            showMsaData();
                            $('#franchise').addClass('hide');
                            $('#addFp').addClass('hide');
                            break;
                        }
                    }
                }).fail(function () {
                    alert('JSON file not found');
                });
            }
        });

        w2ui['tenant'].load('tenant.json');

        setTimeout(() => {
            const alignRightHeader = [
                'Main Contact',
                'Email'
            ]

            w2ui.tenant.refresh();
            $('.w2ui-col-header').each(function (index, header) {
                if (alignRightHeader.indexOf(header.innerText) !== -1) {
                    $(header).css('text-align', 'right');
                }
            });
        }, 10);
    }

    function backNotAllowed() {
        history.pushState(null, document.title, location.href);
        window.addEventListener('popstate', function (event) {
            history.pushState(null, document.title, location.href);
        });
    }
});

function changeToBreadcrumbLink(newLocation, area = '') {
    const currentText = $('.show-for-sr').parent().text().replace(regex, '').trim();
    const currentLi = $('.show-for-sr').parent();
    const state = {
        Atlanta: 'Georgia',
        Miami: 'Florida',
        Charleston: 'South Carolina',
        Charlotte: 'North Carolina',
        Memphis: 'Tennessee',
        'Tampa Bay': 'Florida',
        Jacksonville: 'Florida'
    }

    currentLi.empty();

    if (area === 'city') {
        const loc = currentText.indexOf(',') === -1 ? currentText : currentText.substring(0, currentText.indexOf(','));
        const city = loc;

        currentLi.append('<a id=\'city-link\'>' + city + '</a>');
        $('#city').text(city);
        $('#state').text(state[city]);
        $('#trade').text(newLocation);
    } else if (area === 'trade') {
        currentLi.append('<a id=\'trade-link\'>' + currentText + '</a>');
    } else if (area === 'tenant') {
        currentLi.append('<a id=\'tenant-link\'>' + currentText + '</a>');
    } else if (area === 'msa') {
        currentLi.append('<a id=\'msa-link\'>' + currentText + '</a>');
    }

    addCurrentLocation(currentLi, newLocation)
}

function addCurrentLocation(currentLi, newLocation) {
    currentLi.parent().append(
        '<li>' +
        '<span class=\'show-for-sr\'></span>' +
        '<span class=\'bolder\'>' + newLocation + '</span>' +
        '</li>'
    );
}

function showMsaData() {
    $('#combobox').empty();
    $('#combobox').append(
        '<option>CBSA</option>'
    );

    if (w2ui.hasOwnProperty('msa')) {
        w2ui['msa'].destroy();
    }

    $('#myGrid').w2grid({
        name: 'msa',
        method: 'GET',
        show: {
            toolbar: true,
            lineNumbers: true,
        },
        columns: [
            { field: 'col1', text: 'MSAs', size: '300px', sortable: true },
            { field: 'col2', text: 'CBSA code', size: '250px', sortable: true }
        ],
        onClick: function (event) {
            const grid = this;

            $.getJSON('msa.json', function (e) {
                const data = e.records;

                for (const rowData of data) {
                    if (rowData.recid === grid.getSelection()[0]) {
                        changeToBreadcrumbLink(rowData.col1, 'msa');
                        showSiteData();
                        $('#msa').addClass('hide');
                        $('#territory').addClass('hide');
                        $('#accordion-title-buttons').children().first().text('Add Site');
                        $('#addSite').removeClass('hide');
                        break;
                    }
                }
            }).fail(function () {
                alert('JSON file not found');
            });
        }
    });

    w2ui['msa'].load('msa.json');
}

function showSiteData() {
    $('#combobox').empty();
    $('#combobox').append(
        '<option>Sites</option>'
    );

    if (w2ui.hasOwnProperty('site')) {
        w2ui['site'].destroy();
    }

    $('#myGrid').w2grid({
        name: 'site',
        method: 'GET',
        show: {
            toolbar: true,
            lineNumbers: true,
        },
        columns: [
            { field: 'col1', text: 'Center', size: '300px', sortable: true },
            { field: 'col2', text: 'Broker', size: '200px', sortable: true },
            { field: 'col3', text: 'Owned By', size: '200px', sortable: true },
            { field: 'col4', text: 'Owner', size: '200px', sortable: true },
            { field: 'col5', text: 'Status', size: '200px', sortable: true }
        ],
        onClick: function (event) {
            const grid = this;

            $.getJSON('site.json', function (e) {
                const data = e.records;

                for (const rowData of data) {
                    if (rowData.recid === grid.getSelection()[0]) {
                        changeToBreadcrumbLink(rowData.col1, 'city');
                        showStageData();
                        break;
                    }
                }
            }).fail(function () {
                alert('JSON file not found');
            });
        }
    });

    w2ui['site'].load('site.json');
}

function showStageData() {
    $('#combobox').empty();
    $('#combobox').append(
        '<option>Sites</option>'
    );

    if (w2ui.hasOwnProperty('stage')) {
        w2ui['stage'].destroy();
    }

    $('#myGrid').w2grid({
        name: 'stage',
        method: 'GET',
        show: {
            toolbar: true,
            lineNumbers: true,
        },
        columns: [
            { field: 'col1', text: 'Center', size: '300px', sortable: true },
            { field: 'col2', text: 'Broker', size: '200px', sortable: true },
            { field: 'col3', text: 'Owned By', size: '200px', sortable: true },
            { field: 'col4', text: 'Owner', size: '200px', sortable: true },
            { field: 'col5', text: 'Status', size: '200px', sortable: true }
        ],
        onClick: function (event) {
            const grid = this;

            $.getJSON('stage.json', function (e) {
                const data = e.records;

                for (const rowData of data) {
                    if (rowData.recid === grid.getSelection()[0]) {
                        changeToBreadcrumbLink(rowData.col1, 'trade');
                        showStageDetailData();
                        $('#accordion-title-buttons').addClass('hide');
                        $('.accordion-title').last().addClass('hide');
                        $('#chart-here').addClass('hide');
                        $('#myGrid').addClass('hide');
                        $('#dropdown-container').addClass('hide');
                        $('#arrow-progress-bar').removeClass('hide');
                        $('#log-container').removeClass('hide');
                        $('#stage-container').removeClass('hide');
                        $('#grid-container .accordion-title').last().removeClass('hide');
                        $('#stage-here')
                            .removeClass('hide')
                            .css('display', 'block');
                        $('#stage').text(rowData.col1);
                        $('#grid-container .accordion').each(function () {
                            $(this).css('height', '327px');
                        });
                        $('#grid-container .accordion').first().css('margin-top', '20px');
                        $('#grid-container .accordion').last().css('margin-top', '3px');
                        $('#grid-container .accordion-content').first().css('height', '328px');
                        break;
                    }
                }
            }).fail(function () {
                alert('JSON file not found');
            });
        }
    });

    w2ui['stage'].load('stage.json');
}

function showStageDetailData() {
    if (w2ui.hasOwnProperty('stage-detail')) {
        w2ui['stage-detail'].destroy();
    }

    $('#myGrid2').removeClass('hide');
    $('#myGrid2').w2grid({
        name: 'stage-detail',
        method: 'GET',
        show: {
            selectColumn: true
        },
        multiSelect: true,
        columns: [
            { field: 'col1', text: 'STEPS', size: '50px', sortable: true },
            { field: 'col2', text: 'NAME', size: '200px', sortable: true },
            { field: 'col3', text: 'Assigned to', size: '200px', sortable: true },
            { field: 'col4', text: 'DATE STARTED', size: '200px', sortable: true },
            { field: 'col5', text: 'CURRENT DURATION', size: '200px', sortable: true },
            { field: 'col6', text: 'EXPECTED DURATION', size: '200px', sortable: true }
        ],
        onClick: function (event) {
            // const grid = this;

            // $.getJSON('stage.json', function (e) {
            //     const data = e.records;

            //     for (const rowData of data) {
            //         if (rowData.recid === grid.getSelection()[0]) {
            //             changeToBreadcrumbLink(rowData.col1, 'trade');
            //             showSiteData();
            //             $('#combobox').empty();
            //             $('#combobox').append(
            //                 '<option>Sites</option>'
            //             );
            //             break;
            //         }
            //     }
            // }).fail(function () {
            //     alert('JSON file not found');
            // });
        }
    });

    w2ui['stage-detail'].load('stage-detail.json');
    w2ui['stage-detail'].refresh();
}
