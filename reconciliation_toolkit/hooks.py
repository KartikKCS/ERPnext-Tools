app_name = "reconciliation_toolkit"
app_title = "Reconciliation Toolkit"
app_publisher = "Katalystic Consulting"
app_description = "Data reconciliation tools for ERPNext"
app_email = "jhalariagautam@gmail.com"
app_license = "mit"

# Apps
# ------------------

# required_apps = []

# Each item in the list will be shown as an app in the apps page
# add_to_apps_screen = [
# 	{
# 		"name": "reconciliation_toolkit",
# 		"logo": "/assets/reconciliation_toolkit/logo.png",
# 		"title": "Reconciliation Toolkit",
# 		"route": "/reconciliation_toolkit",
# 		"has_permission": "reconciliation_toolkit.api.permission.has_app_permission"
# 	}
# ]

# Includes in <head>
# ------------------

# include js, css files in header of desk.html
# app_include_css = "/assets/reconciliation_toolkit/css/reconciliation_toolkit.css"
# app_include_js = "/assets/reconciliation_toolkit/js/reconciliation_toolkit.js"

# include js, css files in header of web template
# web_include_css = "/assets/reconciliation_toolkit/css/reconciliation_toolkit.css"
# web_include_js = "/assets/reconciliation_toolkit/js/reconciliation_toolkit.js"

# include custom scss in every website theme (without file extension ".scss")
# website_theme_scss = "reconciliation_toolkit/public/scss/website"

# include js, css files in header of web form
# webform_include_js = {"doctype": "public/js/doctype.js"}
# webform_include_css = {"doctype": "public/css/doctype.css"}

# include js in page
# page_js = {"page" : "public/js/file.js"}

# include js in doctype views
# doctype_js = {"doctype" : "public/js/doctype.js"}
# doctype_list_js = {"doctype" : "public/js/doctype_list.js"}
# doctype_tree_js = {"doctype" : "public/js/doctype_tree.js"}
# doctype_calendar_js = {"doctype" : "public/js/doctype_calendar.js"}

# Svg Icons
# ------------------
# include app icons in desk
# app_include_icons = "reconciliation_toolkit/public/icons.svg"

# Home Pages
# ----------

# application home page (will override Website Settings)
# home_page = "login"

# website user home page (by Role)
# role_home_page = {
# 	"Role": "home_page"
# }

# Generators
# ----------

# automatically create page for each record of this doctype
# website_generators = ["Web Page"]

# automatically load and sync documents of this doctype from downstream apps
# importable_doctypes = [doctype_1]

# Jinja
# ----------

# add methods and filters to jinja environment
# jinja = {
# 	"methods": "reconciliation_toolkit.utils.jinja_methods",
# 	"filters": "reconciliation_toolkit.utils.jinja_filters"
# }

# Installation
# ------------

# before_install = "reconciliation_toolkit.install.before_install"
# after_install = "reconciliation_toolkit.install.after_install"

# Uninstallation
# ------------

# before_uninstall = "reconciliation_toolkit.uninstall.before_uninstall"
# after_uninstall = "reconciliation_toolkit.uninstall.after_uninstall"

# Integration Setup
# ------------------
# To set up dependencies/integrations with other apps
# Name of the app being installed is passed as an argument

# before_app_install = "reconciliation_toolkit.utils.before_app_install"
# after_app_install = "reconciliation_toolkit.utils.after_app_install"

# Integration Cleanup
# -------------------
# To clean up dependencies/integrations with other apps
# Name of the app being uninstalled is passed as an argument

# before_app_uninstall = "reconciliation_toolkit.utils.before_app_uninstall"
# after_app_uninstall = "reconciliation_toolkit.utils.after_app_uninstall"

# Desk Notifications
# ------------------
# See frappe.core.notifications.get_notification_config

# notification_config = "reconciliation_toolkit.notifications.get_notification_config"

# Permissions
# -----------
# Permissions evaluated in scripted ways

# permission_query_conditions = {
# 	"Event": "frappe.desk.doctype.event.event.get_permission_query_conditions",
# }
#
# has_permission = {
# 	"Event": "frappe.desk.doctype.event.event.has_permission",
# }

# Document Events
# ---------------
# Hook on document methods and events

# doc_events = {
# 	"*": {
# 		"on_update": "method",
# 		"on_cancel": "method",
# 		"on_trash": "method"
# 	}
# }

# Scheduled Tasks
# ---------------

# scheduler_events = {
# 	"all": [
# 		"reconciliation_toolkit.tasks.all"
# 	],
# 	"daily": [
# 		"reconciliation_toolkit.tasks.daily"
# 	],
# 	"hourly": [
# 		"reconciliation_toolkit.tasks.hourly"
# 	],
# 	"weekly": [
# 		"reconciliation_toolkit.tasks.weekly"
# 	],
# 	"monthly": [
# 		"reconciliation_toolkit.tasks.monthly"
# 	],
# }

# Testing
# -------

# before_tests = "reconciliation_toolkit.install.before_tests"

# Extend DocType Class
# ------------------------------
#
# Specify custom mixins to extend the standard doctype controller.
# extend_doctype_class = {
# 	"Task": "reconciliation_toolkit.custom.task.CustomTaskMixin"
# }

# Overriding Methods
# ------------------------------
#
# override_whitelisted_methods = {
# 	"frappe.desk.doctype.event.event.get_events": "reconciliation_toolkit.event.get_events"
# }
#
# each overriding function accepts a `data` argument;
# generated from the base implementation of the doctype dashboard,
# along with any modifications made in other Frappe apps
# override_doctype_dashboards = {
# 	"Task": "reconciliation_toolkit.task.get_dashboard_data"
# }

# exempt linked doctypes from being automatically cancelled
#
# auto_cancel_exempted_doctypes = ["Auto Repeat"]

# Ignore links to specified DocTypes when deleting documents
# -----------------------------------------------------------

# ignore_links_on_delete = ["Communication", "ToDo"]

# Request Events
# ----------------
# before_request = ["reconciliation_toolkit.utils.before_request"]
# after_request = ["reconciliation_toolkit.utils.after_request"]

# Job Events
# ----------
# before_job = ["reconciliation_toolkit.utils.before_job"]
# after_job = ["reconciliation_toolkit.utils.after_job"]

# User Data Protection
# --------------------

# user_data_fields = [
# 	{
# 		"doctype": "{doctype_1}",
# 		"filter_by": "{filter_by}",
# 		"redact_fields": ["{field_1}", "{field_2}"],
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_2}",
# 		"filter_by": "{filter_by}",
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_3}",
# 		"strict": False,
# 	},
# 	{
# 		"doctype": "{doctype_4}"
# 	}
# ]

# Authentication and authorization
# --------------------------------

# auth_hooks = [
# 	"reconciliation_toolkit.auth.validate"
# ]

# Automatically update python controller files with type annotations for this app.
# export_python_type_annotations = True

# default_log_clearing_doctypes = {
# 	"Logging DocType Name": 30  # days to retain logs
# }

# Translation
# ------------
# List of apps whose translatable strings should be excluded from this app's translations.
# ignore_translatable_strings_from = []

