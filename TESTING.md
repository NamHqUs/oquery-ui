# BUGS, IMPROMENTS

## OQuery Editor

- Bug: Undo only 1 or 2 steps
- Bug: Select multiple rows then Ship Tab -> only 1 level back, not work with 2 consecutive
- Bug: Select multipee rows then Tab multiple time -> each time auto append selecting more than original selection.
- Bug: The Gutter sometimes wider
- Bug: Select a text, should highlight the same text at other location
- Bug: Select text, ctrlx -> delete a row, Expected just delete selected text
- Bug: Don't select any text -> ctrlx -> don't delete the current row
- Expected: In home page, Gutter has only one run icons so they should align center.
- Bug: In QuerBulder page, zindex of suggestion popup is lower that datagrid result.
- Expected: Run a context gutter icon even when an unrelated incomplete header is present.

### Verified fixes

- Editor Enter, Tab, and Shift+Tab edits now use native textarea transactions so consecutive edits remain undoable.
- Ctrl+X deletes the current row when there is no selection; with selected text it deletes only the selected text.
- Query Builder completion suggestions are raised above the result panel.
- The Home OrgChart can be panned by dragging its chart surface while node expansion/collapse remains clickable.

## Home

### Chart

- Expected: OrgChart should be drag to move

### Samples

- Expected these samples with extractive Questions:

```oQuery

Employees:

Employees: Id, FirstName, Manager.FirstName, Department.Name

Departments:
   Name, 
   Employees.CountIf(Location.Name like <%Atlanta%>) EmployeesInAtlanta

EmployeeTree is Employees:
    FirstName ManagerName,
    Members.Count(Id) TotalMembers,
    tree.FirstName MemberName,
  JOIN EmployeeTree tree on Id = tree.ManagerId

Products:
    Name,
    Revenue.Avg() Average,
    OrderItems.Sum(Quantity * UnitPrice) Revenue
WHERE Revenue > Average
```
