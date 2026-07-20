frappe.ui.form.on('Smart Statement Import', {
    refresh: function(frm) {
        if (frm.doc.status === 'Pending' && frm.doc.import_file) {
            frm.add_custom_button(__('Process Import'), function() {
                frappe.call({
                    method: 'process_file',
                    doc: frm.doc,
                    freeze: true,
                    freeze_message: __('Processing statement...'),
                    callback: function(r) {
                        frm.reload_doc();
                        if (r.message) {
                            show_import_results(frm, r.message);
                        }
                    }
                });
            }).addClass('btn-primary');
            
            frm.add_custom_button(__('Review / Edit Mapping'), function() {
                open_mapping_dialog(frm);
            });
        }
    },
    import_file: function(frm) {
        if (frm.doc.import_file) {
            frm.set_value('status', 'Pending');
            frm.set_value('error_log', '');
            frm.set_value('transactions_created', 0);
            frm.save().then(() => {
                open_mapping_dialog(frm);
            });
        }
    },
    custom_parser: function(frm) {
        if (frm.doc.custom_parser) {
            frappe.db.get_value('Bank Statement Parser Profile', frm.doc.custom_parser, 'mapping_json')
            .then(r => {
                if(r.message && r.message.mapping_json) {
                    frm.set_value('custom_mapping_json', r.message.mapping_json);
                    frappe.show_alert({message:__('Mapping applied from profile'), indicator:'green'});
                }
            });
        }
    }
});

function open_mapping_dialog(frm) {
    frappe.call({
        method: 'get_file_headers',
        doc: frm.doc,
        freeze: true,
        freeze_message: __('Reading file headers...'),
        callback: function(r) {
            if(r.message) {
                show_dialog(frm, r.message.columns, r.message.guessed_mapping);
            }
        }
    });
}

function show_dialog(frm, columns, guessed_mapping) {
    let current_mapping = {};
    if (frm.doc.custom_mapping_json) {
        try {
            current_mapping = JSON.parse(frm.doc.custom_mapping_json);
        } catch(e) {}
    } else {
        for (let key in guessed_mapping) {
            current_mapping[key] = [guessed_mapping[key]];
        }
    }

    let html = `
    <style>
    .mapping-table { width: 100%; margin-bottom: 15px; }
    .mapping-table th, .mapping-table td { padding: 8px; border-bottom: 1px solid #eee; vertical-align: top; }
    .dropdown-checkbox-menu { position: relative; display: inline-block; width: 100%; }
    .dropdown-btn {
        background-color: #fff; border: 1px solid #d1d8dd; padding: 5px 10px; font-size: 13px;
        cursor: pointer; width: 100%; text-align: left; border-radius: 4px; display: flex;
        justify-content: space-between; align-items: center; min-height: 30px;
    }
    .dropdown-btn::after { content: "\\25BC"; font-size: 10px; color: #8D99A6; }
    .dropdown-content {
        display: none; position: absolute; background-color: #fff; min-width: 100%; max-height: 200px;
        overflow-y: auto; box-shadow: 0px 8px 16px 0px rgba(0,0,0,0.1); z-index: 100;
        border: 1px solid #d1d8dd; border-radius: 4px; margin-top: 4px;
    }
    .dropdown-content label {
        display: block; padding: 6px 10px; margin: 0; cursor: pointer; font-weight: normal; font-size: 13px;
    }
    .dropdown-content label:hover { background-color: #f8f9fa; }
    .dropdown-content input[type="checkbox"] { margin-right: 8px; vertical-align: middle; }
    </style>
    <table class="mapping-table">
        <tr>
            <th width="40%">System Column</th>
            <th width="60%">File Column(s)</th>
        </tr>
    `;
    const sys_cols = [
        {id: 'date', label: 'Date Column *'},
        {id: 'description', label: 'Description *<br><small class="text-muted">Merge multiple columns if needed</small>'},
        {id: 'reference_number', label: 'Reference Number'},
        {id: 'withdrawal', label: 'Withdrawal'},
        {id: 'deposit', label: 'Deposit'},
        {id: 'amount', label: 'Amount<br><small class="text-muted">If combined in one column</small>'},
        {id: 'indicator', label: 'Indicator (Dr/Cr)<br><small class="text-muted">Used with Amount column</small>'}
    ];

    sys_cols.forEach(sc => {
        let selected = current_mapping[sc.id] || [];
        if (!Array.isArray(selected)) selected = [selected];
        
        let options_html = columns.map(c => `
            <label>
                <input type="checkbox" value="${c}" data-sys="${sc.id}" ${selected.includes(c) ? 'checked' : ''}>
                ${c}
            </label>
        `).join('');
        
        let selected_text = selected.length > 0 ? selected.join(', ') : 'Select columns...';
        
        html += `
        <tr>
            <td>${sc.label}</td>
            <td>
                <div class="dropdown-checkbox-menu">
                    <div class="dropdown-btn">
                        <span class="dropdown-text">${selected_text}</span>
                    </div>
                    <div class="dropdown-content">
                        ${options_html}
                    </div>
                </div>
            </td>
        </tr>`;
    });
    html += `</table>`;

    let fields = [
        {
            fieldname: 'html_mapping',
            fieldtype: 'HTML',
            options: html
        },
        { fieldtype: 'Section Break' },
        {
            fieldname: 'save_profile',
            fieldtype: 'Check',
            label: __('Save this mapping profile for future use')
        },
        {
            fieldname: 'profile_name',
            fieldtype: 'Data',
            label: __('Profile Name'),
            depends_on: 'eval:doc.save_profile==1'
        }
    ];

    let d = new frappe.ui.Dialog({
        title: __('Map Columns'),
        fields: fields,
        size: 'large',
        primary_action_label: __('Apply Mapping'),
        primary_action(values) {
            let new_mapping = {};
            $(d.wrapper).find('.dropdown-checkbox-menu').each(function() {
                let sys = $(this).find('input[type="checkbox"]').first().data('sys');
                let vals = $(this).find('input[type="checkbox"]:checked').map(function() { return this.value; }).get();
                if (vals && vals.length > 0) {
                    new_mapping[sys] = vals;
                }
            });
            
            frm.set_value('custom_mapping_json', JSON.stringify(new_mapping));
            
            if (values.save_profile && values.profile_name) {
                frappe.db.insert({
                    doctype: 'Bank Statement Parser Profile',
                    parser_name: values.profile_name,
                    mapping_json: JSON.stringify(new_mapping)
                }).then(doc => {
                    frm.set_value('custom_parser', doc.name);
                    frm.save();
                    frappe.show_alert({message:__('Profile Saved and Applied'), indicator:'green'});
                    d.hide();
                });
            } else {
                frm.set_value('custom_parser', '');
                frm.save();
                frappe.show_alert({message:__('Mapping Applied'), indicator:'green'});
                d.hide();
            }
        }
    });
    
    d.show();

    setTimeout(() => {
        $(d.wrapper).find('.dropdown-btn').on('click', function(e) {
            e.stopPropagation();
            let content = $(this).siblings('.dropdown-content');
            let is_visible = content.is(':visible');
            $(d.wrapper).find('.dropdown-content').hide();
            if (!is_visible) {
                content.show();
            }
        });
        
        $(d.wrapper).find('.dropdown-content input[type="checkbox"]').on('change', function() {
            let menu = $(this).closest('.dropdown-checkbox-menu');
            let checked = menu.find('input[type="checkbox"]:checked').map(function() { return this.value; }).get();
            menu.find('.dropdown-text').text(checked.length > 0 ? checked.join(', ') : 'Select columns...');
        });
        
        $(document).on('click.mapping', function(e) {
            if (!$(e.target).closest('.dropdown-checkbox-menu').length) {
                $(d.wrapper).find('.dropdown-content').hide();
            }
        });
        
        d.onhide = () => {
            $(document).off('click.mapping');
        };
    }, 100);
}

function show_import_results(frm, results) {
    let success_rate = results.total_rows > 0 ? ((results.successful_rows / results.total_rows) * 100).toFixed(1) : 0;
    
    // Success Notification
    frappe.show_alert({
        message: `Imported ${results.successful_rows} of ${results.total_rows} transactions successfully (${success_rate}%). ${results.failed_rows.length} rows were skipped due to validation errors.`,
        indicator: 'green'
    });

    let html = `
    <style>
    .import-summary-card {
        display: flex;
        justify-content: space-between;
        background-color: #f8f9fa;
        padding: 15px;
        border-radius: 8px;
        border: 1px solid #e2e8f0;
        margin-bottom: 20px;
    }
    .summary-item {
        text-align: center;
        flex: 1;
    }
    .summary-value {
        font-size: 20px;
        font-weight: 600;
        color: #1f2937;
    }
    .summary-label {
        font-size: 12px;
        color: #6b7280;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }
    .text-green { color: #10b981 !important; }
    .text-red { color: #ef4444 !important; }
    .failed-rows-section {
        margin-bottom: 20px;
        border: 1px solid #fecaca;
        border-radius: 8px;
        background-color: #fef2f2;
    }
    .failed-rows-summary {
        padding: 10px 15px;
        font-weight: 600;
        color: #991b1b;
        cursor: pointer;
        outline: none;
    }
    .failed-rows-table {
        width: 100%;
        border-top: 1px solid #fecaca;
        border-collapse: collapse;
    }
    .failed-rows-table th, .failed-rows-table td {
        padding: 8px 15px;
        border-bottom: 1px solid #fecaca;
        text-align: left;
        font-size: 13px;
        color: #7f1d1d;
    }
    .failed-rows-table th {
        background-color: #fee2e2;
    }
    .table-wrapper {
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        overflow: hidden;
    }
    </style>

    <div class="import-summary-card">
        <div class="summary-item">
            <div class="summary-value">${results.total_rows}</div>
            <div class="summary-label">Total Rows</div>
        </div>
        <div class="summary-item">
            <div class="summary-value text-green">${results.successful_rows}</div>
            <div class="summary-label">Successfully Parsed</div>
        </div>
        <div class="summary-item">
            <div class="summary-value text-red">${results.failed_rows.length}</div>
            <div class="summary-label">Failed / Skipped</div>
        </div>
        <div class="summary-item">
            <div class="summary-value">${success_rate}%</div>
            <div class="summary-label">Success Rate</div>
        </div>
    </div>
    `;

    if (results.failed_rows && results.failed_rows.length > 0) {
        let headers = ['Row #', 'Reason for Failure'];
        let data_keys = new Set();
        results.failed_rows.forEach(r => {
            if (r.row_data && typeof r.row_data === 'object') {
                Object.keys(r.row_data).forEach(k => data_keys.add(k));
            }
        });
        let data_keys_arr = Array.from(data_keys);
        headers = headers.concat(data_keys_arr);

        let thead_html = `<tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>`;

        let tbody_html = results.failed_rows.map(r => {
            let tds = `<td>${r.row_num}</td><td><span style="color: #d9534f; font-weight: 600;">${r.reason}</span></td>`;
            data_keys_arr.forEach(k => {
                let val = (r.row_data && r.row_data[k]) ? r.row_data[k] : '';
                tds += `<td><span style="font-size: 12px; color: #555;">${frappe.utils.escape_html(String(val))}</span></td>`;
            });
            return `<tr>${tds}</tr>`;
        }).join('');

        html += `
        <details class="failed-rows-section" open>
            <summary class="failed-rows-summary">⚠️ View ${results.failed_rows.length} Failed Rows</summary>
            <div style="overflow-x: auto;">
                <table class="failed-rows-table">
                    <thead>${thead_html}</thead>
                    <tbody>${tbody_html}</tbody>
                </table>
            </div>
        </details>
        `;
    }

    html += `
    <h5 class="mb-3">Processed Transactions Preview</h5>
    <div class="table-wrapper" style="min-height: 350px;">
        <div id="transactions-datatable" style="height: 350px;"></div>
    </div>
    `;

    let d = new frappe.ui.Dialog({
        title: __('Import Results'),
        fields: [
            {
                fieldtype: 'HTML',
                fieldname: 'results_html',
                options: html
            }
        ],
        size: 'extra-large',
        primary_action_label: __('Close'),
        primary_action(values) {
            d.hide();
        }
    });

    d.show();

    setTimeout(() => {
        let columns = [
            { name: "Date", id: "date", editable: false, width: 120 },
            { name: "Description", id: "description", editable: false, width: 350 },
            { name: "Ref Number", id: "reference_number", editable: false, width: 150 },
            { 
                name: "Withdrawal", id: "withdrawal", editable: false, width: 120,
                format: (value) => {
                    let v = parseFloat(value);
                    if (v > 0) return `<span class="text-red" style="font-weight:600">- ${v.toFixed(2)}</span>`;
                    return "";
                }
            },
            { 
                name: "Deposit", id: "deposit", editable: false, width: 120,
                format: (value) => {
                    let v = parseFloat(value);
                    if (v > 0) return `<span class="text-green" style="font-weight:600">+ ${v.toFixed(2)}</span>`;
                    return "";
                }
            }
        ];

        let wrapper = $(d.wrapper).find('#transactions-datatable')[0];
        if (wrapper) {
            if (typeof frappe.DataTable !== 'undefined') {
                try {
                    new frappe.DataTable(wrapper, {
                        columns: columns,
                        data: results.transactions || [],
                        layout: 'fluid',
                        cellHeight: 35,
                        filter: true, 
                        sortable: true
                    });
                } catch(e) {
                    console.error("DataTable error", e);
                    render_fallback_table(wrapper, results.transactions);
                }
            } else {
                render_fallback_table(wrapper, results.transactions);
            }
        }

        function render_fallback_table(wrapper, data) {
            let thead = '<tr><th>Date</th><th>Description</th><th>Ref Number</th><th>Withdrawal</th><th>Deposit</th></tr>';
            let tbody = (data || []).map(r => {
                let w = parseFloat(r.withdrawal) > 0 ? `<span class="text-red font-weight-bold">- ${parseFloat(r.withdrawal).toFixed(2)}</span>` : '';
                let d = parseFloat(r.deposit) > 0 ? `<span class="text-green font-weight-bold">+ ${parseFloat(r.deposit).toFixed(2)}</span>` : '';
                return `<tr>
                    <td>${frappe.utils.escape_html(r.date || '')}</td>
                    <td>${frappe.utils.escape_html(r.description || '')}</td>
                    <td>${frappe.utils.escape_html(r.reference_number || '')}</td>
                    <td>${w}</td>
                    <td>${d}</td>
                </tr>`;
            }).join('');
            
            wrapper.innerHTML = `
                <div style="max-height: 350px; overflow-y: auto;">
                    <table class="table table-bordered table-hover" style="width: 100%;">
                        <thead style="position: sticky; top: 0; background: white; z-index: 1;">${thead}</thead>
                        <tbody>${tbody}</tbody>
                    </table>
                </div>
            `;
        }
    }, 500);
}
